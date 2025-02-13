import { Client, composeContext, Content, elizaLogger, generateMessageResponse, HandlerCallback, IAgentRuntime, Memory, messageCompletionFooter, ModelClass, State, stringToUuid, UUID } from "@elizaos/core";
import { DefaultTaskManager } from "./tasks";
import { DefaultTriggerManager } from "./triggers";
import { Task, Trigger, TriggerType } from "./types";
import { initializeTasks } from "./init-tasks";

const USER_NAME = "Admin";

export const triggerHandlerTemplate =
  `
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Global Responsibilities and Guidelines

You are an autonomous trading agent and quantitative analyst specializing in crypto derivatives for a crypto hedge fund.
Your overarching mission is to continuously monitor the cryptocurrency market and execute data-driven trading strategies that generate profits while rigorously managing risk—all within the confines of a fixed account balance (no additional funds will be provided).
Your decisions must always align with the long-term goal of optimizing returns while strictly managing risk.

# All Tasks
{{#each tasks}}
- Task: {{this.description}}
  Status: {{this.status}}
  Definition of Done: {{this.definitionOfDone}}
{{/each}}

# Current Task
{{currentTask}}

# Task: Generate dialog and actions for the {{agentName}}
(Explicitly specify action details in response text if they were requested by action description)

{{providers}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for the {{agentName}}.
` + messageCompletionFooter;

const triggerAdjustmentTemplate = `
Based on the current task and recent conversations, determine what triggers should be active:

Current Task: {{taskDescription}}
Available Trigger Types: polling, dynamic, price

Active Triggers:
{{#each activeTriggers}}
- Type: {{this.type}}
  Parameters: {{this.params}}
{{/each}}

Recent conversations:
{{recentMessages}}

Respond with a JSON array of triggers to set/modify/remove:
{
  "triggers": [
    {
      "type": "string",
      "params": object,
      "action": "add|remove|modify"
    }
  ]
}
`;

export const TraderClient: Client = {
  start: async (_runtime: IAgentRuntime, interval?: number): Promise<void> => {
    elizaLogger.log("CronClient: start");

    const { agentId } = _runtime;
    const roomId = stringToUuid("default-room-" + agentId);
    const userId = stringToUuid(USER_NAME);

    const taskManager = new DefaultTaskManager(_runtime, roomId, userId, agentId);
    const triggerManager = new DefaultTriggerManager(_runtime, roomId, userId, agentId);

    const callback = (messageId: UUID): HandlerCallback => async (content: Content) => {
      elizaLogger.debug('Processing action callback', { 
        messageId,
        actionType: content.action,
        content 
      });

      const memory: Memory = {
        id: stringToUuid(messageId + "-" + _runtime.agentId + "-" + content.action),
        roomId,
        agentId,
        userId: _runtime.agentId,
        content,
        createdAt: Date.now()
      };

      await _runtime.messageManager.createMemory(memory);

      return [memory];
    };

    const processTask = async (task: Task) => {
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
        id: stringToUuid(Date.now().toString() + "-trigger-" + firstPositiveTrigger.type),
        roomId,
        agentId,
        userId: _runtime.agentId,
        content: {
          text: `Trigger activated: ${firstPositiveTrigger.type}`,
          type: firstPositiveTrigger.type,
          params: firstPositiveTrigger.params
        },
        createdAt: Date.now()
      };
      await _runtime.messageManager.createMemory(triggerMemory);

      // Initial state composition
      let state = await _runtime.composeState(triggerMemory, {
        agentName: _runtime.character.name,
        tasks: allTasks
      });

      // Generate response based on current task and state
      let template = triggerHandlerTemplate;
      
      // Replace all template placeholders
      const replacements = {
        currentTask: `Description: ${task.description}\nDefinition of Done: ${task.definitionOfDone}`,
        agentName: _runtime.character.name,
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
        runtime: _runtime,
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
        id: stringToUuid(Date.now().toString() + "-" + _runtime.agentId),
        roomId,
        agentId,
        userId: _runtime.agentId,
        content: response,
        createdAt: Date.now()
      };
      await _runtime.messageManager.createMemory(responseMemory);
      state = await _runtime.updateRecentMessageState(state);

      elizaLogger.info('Processing actions from response...');
      // Process any actions in the response
      await _runtime.processActions(
        responseMemory,
        [responseMemory],
        state,
        callback(responseMemory.id)
      );

      await _runtime.evaluate(triggerMemory || responseMemory, state, true);

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
          runtime: _runtime,
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
                    id: stringToUuid(Date.now().toString()).toString(),
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
    };

    // Initialize tasks if none exist and wait for initialization
    const tasks = await taskManager.getAllTasks();
    elizaLogger.info('Task initialization check', { taskCount: tasks.length });
    if (tasks.length === 0) {
      elizaLogger.info("No tasks found, initializing...");
      await initializeTasks(taskManager);
      elizaLogger.info("Tasks initialized");
    } else {
      elizaLogger.info(`${tasks.length} tasks found`);
    }

    // Ensure there's always one polling trigger
    const triggers = await triggerManager.getAllTriggers();
    const hasPollingTrigger = triggers.some(t => t.type === TriggerType.POLLING);
    if (!hasPollingTrigger) {
      elizaLogger.info("Creating polling trigger");
      await triggerManager.addTrigger({
        id: stringToUuid(Date.now().toString()).toString(),
        type: TriggerType.POLLING,
        params: { interval: 5000 }
      });
      elizaLogger.info("Polling trigger created");
    }

    // Wait for task manager to initialize current task
    await new Promise(resolve => setTimeout(resolve, 1000));
    elizaLogger.info('Current task status', { 
      hasCurrentTask: !!taskManager.currentTask,
      currentTaskDescription: taskManager.currentTask?.description 
    });

    const iterate = async () => {
      elizaLogger.info("CronClient: Starting iteration");

      await _runtime.ensureConnection(
        userId,
        roomId,
        USER_NAME,
        USER_NAME,
        "direct"
      );

      // Process current task if exists
      elizaLogger.debug('Checking for current task...');
      const currentTask = taskManager.currentTask;
      if (currentTask) {
        elizaLogger.info(`Found current task: ${currentTask.description}`);
        await processTask(currentTask);
      } else {
        elizaLogger.warn('No current task available - task manager may need initialization');
      }
    };

    while (true) {
      await iterate();
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Check every 5 seconds
    }
  },

  stop: async (_runtime: IAgentRuntime) => {
    elizaLogger.info("CronClient: Stopping client");
  },
};
