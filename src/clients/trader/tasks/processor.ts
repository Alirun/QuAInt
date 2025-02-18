import { elizaLogger, generateMessageResponse, IAgentRuntime, Memory, ModelClass, composeContext, stringToUuid, UUID } from "@elizaos/core";
import { Task, Trigger, TriggerEvaluation } from "../core/types";
import { DefaultTaskManager } from "../core/task-manager";
import { DefaultTriggerManager } from "../core/trigger-manager";
import { DefaultNoteManager } from "../core/note-manager";
import { triggerHandlerTemplate } from "../constants/templates";
import { composeStateWithDefaults } from "../utils/state-composer";

export async function processTask(
  task: Task,
  runtime: IAgentRuntime,
  taskManager: DefaultTaskManager,
  triggerManager: DefaultTriggerManager,
  noteManager: DefaultNoteManager,
  roomId: UUID,
  callback: (messageId: UUID) => (content: any) => Promise<Memory[]>
): Promise<void> {
  elizaLogger.info(`Processing task: ${task.description}`);
  
  // Get active triggers for this task
  const triggers = await triggerManager.getAllTriggers();
  elizaLogger.debug(`Found ${triggers.length} active triggers`);
  let shouldProcessTask = false;

  // Check if any trigger is activated and store first positive trigger
  let firstPositiveTrigger: Trigger | null = null;
  let triggerEvaluation: TriggerEvaluation | null = null;
  for (const trigger of triggers) {
    elizaLogger.debug('Evaluating trigger', { type: trigger.type });
    const evaluation = await triggerManager.evaluateTrigger(trigger);
    if (evaluation.isTriggered) {
      shouldProcessTask = true;
      firstPositiveTrigger = trigger;
      triggerEvaluation = evaluation;
      break;
    }
  }
  if (!shouldProcessTask) {
    elizaLogger.debug('No triggers activated, skipping task processing');
    return;
  }
  elizaLogger.info(`Trigger activated: ${firstPositiveTrigger?.type}`, {
    reason: triggerEvaluation?.reason
  });

  // Create memory for first positive trigger if found
  let triggerMemory: Memory | null = null;
  triggerMemory = {
    id: stringToUuid(`${Date.now()}-trigger-${firstPositiveTrigger.type}`),
    roomId,
    agentId: runtime.agentId,
    userId: runtime.agentId,
    content: {
      text: `Starting task: ${task.description}\nTrigger activated: ${firstPositiveTrigger.type} - ${triggerEvaluation.reason}`,
      taskId: task.id,
      taskDescription: task.description,
      taskDefinitionOfDone: task.definitionOfDone,
      taskStatus: task.status,
      type: firstPositiveTrigger.type,
      params: firstPositiveTrigger.params,
      evaluation: triggerEvaluation
    },
    createdAt: Date.now()
  };
  await runtime.messageManager.createMemory(triggerMemory);

  // Compose state and generate response
  let state = await composeStateWithDefaults(runtime, triggerMemory, taskManager, noteManager);
  
  const formattedCurrentTask = `Description: ${task.description}\nDefinition of Done: ${task.definitionOfDone}`;
  
  const context = composeContext({
    state: {
      ...state,
      currentTask: formattedCurrentTask,
      actionExamples: state.actionExamples || '',
      providers: state.providers || '',
      recentMessages: state.recentMessages || '',
      actions: state.actions || ''
    },
    template: triggerHandlerTemplate
  });

  elizaLogger.debug('Generating response for task...', { taskDescription: task.description });
  const response = await generateMessageResponse({
    runtime,
    context,
    modelClass: ModelClass.LARGE,
  });
  elizaLogger.debug('Response generated', { responseLength: response?.text?.length });

  if (!response) {
    elizaLogger.error("CronClient: No response generated");
    return;
  }

  // Save response to memory
  const responseMemory: Memory = {
    id: stringToUuid(`${Date.now()}-${runtime.agentId}`),
    roomId,
    agentId: runtime.agentId,
    userId: runtime.agentId,
    content: response,
    createdAt: Date.now()
  };
  await runtime.messageManager.createMemory(responseMemory);
  state = await runtime.updateRecentMessageState(state);

  elizaLogger.info('Processing actions from response...');
  // Process any actions in the response
  await runtime.processActions(
    responseMemory,
    [responseMemory],
    state,
    callback(responseMemory.id)
  );
  state = await runtime.updateRecentMessageState(state);

  await runtime.evaluate(triggerMemory || responseMemory, state, true);
  state = await runtime.updateRecentMessageState(state);

  // Check if task is complete
  elizaLogger.debug('Evaluating task completion...');
  if (await taskManager.evaluateTaskCompletion(task, state)) {
    elizaLogger.info(`Task completed: ${task.description}`);
    task.status = 'completed';
    await taskManager.updateTask(task);

    // Adjust triggers for next task
    await triggerManager.evaluateAndAdjustTriggers(state);

    // Evaluate and adjust notes
    await noteManager.evaluateNotes(state);
  }
}
