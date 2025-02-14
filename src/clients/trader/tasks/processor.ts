import { elizaLogger, generateMessageResponse, IAgentRuntime, Memory, ModelClass, State, composeContext, stringToUuid, UUID } from "@elizaos/core";
import { Task, Trigger, TriggerEvaluation } from "../core/types";
import { DefaultTaskManager } from "../core/task-manager";
import { DefaultTriggerManager } from "../core/trigger-manager";
import { DefaultNoteManager } from "../core/note-manager";
import { triggerHandlerTemplate, triggerAdjustmentTemplate } from "../constants/templates";

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

  // Get all tasks for template
  const allTasks = await taskManager.getAllTasks();
  const notes = await noteManager.getAllNotes();

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
      text: `Trigger activated: ${firstPositiveTrigger.type} - ${triggerEvaluation.reason}`,
      type: firstPositiveTrigger.type,
      params: firstPositiveTrigger.params,
      evaluation: triggerEvaluation
    },
    createdAt: Date.now()
  };
  await runtime.messageManager.createMemory(triggerMemory);

  // Initial state composition from triggerMemory
  let state = await runtime.composeState(triggerMemory, {
    agentName: runtime.character.name,
    tasks: allTasks,
    notes
  });

  // Generate response based on current task and state
  let template = triggerHandlerTemplate;
  
  // Format tasks and notes
  const formattedTasks = allTasks.map(t => 
    `- Description: ${t.description}\n  Status: ${t.status}\n  Definition of Done: ${t.definitionOfDone}`
  ).join('\n');

  const formattedNotes = notes.map(n => 
    `- Key: ${n.key}\n  Value: ${n.value}\n  Category: ${n.metadata?.category || 'N/A'}\n  Priority: ${n.metadata?.priority || 'N/A'}`
  ).join('\n');

  const formattedCurrentTask = `Description: ${task.description}\nDefinition of Done: ${task.definitionOfDone}`;

  const context = composeContext({
    state: {
      ...state,
      tasks: formattedTasks,
      currentTask: formattedCurrentTask,
      notes: formattedNotes,
      agentName: runtime.character.name,
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
  console.log({ stateBefore: state })
  state = await runtime.updateRecentMessageState(state);
  console.log({ stateAfter: state })

  await runtime.evaluate(triggerMemory || responseMemory, state, true);
  state = await runtime.updateRecentMessageState(state);

  // Check if task is complete
  elizaLogger.debug('Evaluating task completion...');
  if (await taskManager.evaluateTaskCompletion(task, state)) {
    elizaLogger.info(`Task completed: ${task.description}`);
    task.status = 'completed';
    await taskManager.updateTask(task);

    // Adjust triggers for next task
    const currentTaskInfo = await taskManager.getCurrentTaskInfo();
    const nextTasksInfo = await taskManager.getNextTasksInfo();
    const activeTriggers = await triggerManager.getAllTriggers();
    
    // Format active price triggers
    const formattedTriggers = activeTriggers
      .filter(t => t.type === 'price')
      .map(t => `- Type: ${t.type}\n  Parameters: ${JSON.stringify(t.params, null, 2)}`)
      .join('\n');

    const formattedNotes = notes.map(n => 
      `- Key: ${n.key}\n  Value: ${n.value}\n  Category: ${n.metadata?.category || 'N/A'}`
    ).join('\n');
    
    const triggerContext = composeContext({
      state: {
        ...state,
        currentTask: currentTaskInfo || '',
        nextTasks: nextTasksInfo,
        activeTriggers: formattedTriggers,
        notes: formattedNotes
      },
      template: triggerAdjustmentTemplate
    });

    elizaLogger.debug('Generating trigger adjustments for completed task...');
    const triggerResponse = await generateMessageResponse({
      runtime,
      context: triggerContext,
      modelClass: ModelClass.SMALL,
    });
    elizaLogger.debug('Trigger adjustment response received', { hasResponse: !!triggerResponse?.text });

    if (triggerResponse?.text) {
      try {
        const adjustments = JSON.parse(triggerResponse.text);
        elizaLogger.info(`Processing ${adjustments.triggers.length} trigger adjustments`);
        for (const trigger of adjustments.triggers) {
          elizaLogger.debug('Processing trigger adjustment', { action: trigger.action, type: trigger.type });
          switch (trigger.action) {
            case 'add':
              await triggerManager.addTrigger({
                id: stringToUuid(`${Date.now()}`).toString(),
                type: trigger.type,
                params: trigger.params
              });
              break;
            case 'remove':
              if (trigger.id) {
                await triggerManager.removeTrigger(trigger.id);
              }
              break;
            case 'modify':
              if (trigger.id) {
                await triggerManager.updateTrigger({
                  id: trigger.id,
                  type: trigger.type,
                  params: trigger.params
                });
              }
              break;
          }
        }
      } catch (error) {
        elizaLogger.error("Error adjusting triggers:", error);
      }
    }

    // Evaluate and adjust notes
    await noteManager.evaluateNotes(state);
  }
}
