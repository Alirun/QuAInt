import { elizaLogger, generateMessageResponse, IAgentRuntime, Memory, ModelClass, State, composeContext, stringToUuid, UUID } from "@elizaos/core";
import { Task, Trigger } from "../core/types";
import { DefaultTaskManager } from "../core/task-manager";
import { DefaultTriggerManager } from "../core/trigger-manager";
import { triggerHandlerTemplate, triggerAdjustmentTemplate } from "../constants/templates";

export async function processTask(
  task: Task,
  runtime: IAgentRuntime,
  taskManager: DefaultTaskManager,
  triggerManager: DefaultTriggerManager,
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

  // Check if any trigger is activated and store first positive trigger
  let firstPositiveTrigger: Trigger | null = null;
  for (const trigger of triggers) {
    elizaLogger.debug('Evaluating trigger', { type: trigger.type });
    if (await triggerManager.evaluateTrigger(trigger)) {
      shouldProcessTask = true;
      firstPositiveTrigger = trigger;
      break;
    }
  }
  if (!shouldProcessTask) {
    elizaLogger.debug('No triggers activated, skipping task processing');
    return;
  }
  elizaLogger.info(`Trigger activated: ${firstPositiveTrigger?.type}`);

  // Create memory for first positive trigger if found
  let triggerMemory: Memory | null = null;
  triggerMemory = {
    id: stringToUuid(`${Date.now()}-trigger-${firstPositiveTrigger.type}`),
    roomId,
    agentId: runtime.agentId,
    userId: runtime.agentId,
    content: {
      text: `Trigger activated: ${firstPositiveTrigger.type}`,
      type: firstPositiveTrigger.type,
      params: firstPositiveTrigger.params
    },
    createdAt: Date.now()
  };
  await runtime.messageManager.createMemory(triggerMemory);

  // Initial state composition
  let state = await runtime.composeState(triggerMemory, {
    agentName: runtime.character.name,
    tasks: allTasks
  });

  // Generate response based on current task and state
  let template = triggerHandlerTemplate;
  
  // Replace all template placeholders
  const replacements = {
    currentTask: `Description: ${task.description}\nDefinition of Done: ${task.definitionOfDone}`,
    agentName: runtime.character.name,
    actionExamples: state.actionExamples || '',
    providers: state.providers || '',
    recentMessages: state.recentMessages || '',
    actions: state.actions || ''
  };

  // Handle tasks array replacement
  const tasksTemplate = allTasks.map(t => `
- Task: ${t.description}
  Status: ${t.status}
  Definition of Done: ${t.definitionOfDone}`).join('\n');
  
  template = template
    .replace('{{currentTask}}', replacements.currentTask)
    .replace('{{agentName}}', replacements.agentName)
    .replace('{{actionExamples}}', replacements.actionExamples)
    .replace('{{providers}}', replacements.providers)
    .replace('{{recentMessages}}', replacements.recentMessages)
    .replace('{{actions}}', replacements.actions)
    .replace(/{{#each tasks}}[\s\S]*?{{\/each}}/g, tasksTemplate);
  const context = composeContext({
    state,
    template
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

  await runtime.evaluate(triggerMemory || responseMemory, state, true);

  // Check if task is complete
  elizaLogger.debug('Evaluating task completion...');
  if (await taskManager.evaluateTaskCompletion(task, state)) {
    elizaLogger.info(`Task completed: ${task.description}`);
    task.status = 'completed';
    await taskManager.updateTask(task);

    // Adjust triggers for next task
    let template = triggerAdjustmentTemplate;
    
    // Replace all template placeholders
    const activeTriggers = await triggerManager.getAllTriggers();
    const triggersTemplate = activeTriggers.map(t => `
- Type: ${t.type}
  Parameters: ${JSON.stringify(t.params)}`).join('\n');
    
    template = template
      .replace('{{taskDescription}}', task.description)
      .replace('{{recentMessages}}', state.recentMessages || '')
      .replace(/{{#each activeTriggers}}[\s\S]*?{{\/each}}/g, triggersTemplate);
    const triggerContext = composeContext({
      state,
      template
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
  }
}
