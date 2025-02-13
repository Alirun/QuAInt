import { Client, elizaLogger, IAgentRuntime, stringToUuid } from "@elizaos/core";
import { TriggerType } from "./core/types";
import { DefaultTaskManager } from "./core/task-manager";
import { DefaultTriggerManager } from "./core/trigger-manager";
import { initializeTasks } from "./tasks/init-tasks";
import { iterate } from "./client/iteration";

const USER_NAME = "Admin";

export const TraderClient: Client = {
  start: async (_runtime: IAgentRuntime, interval?: number): Promise<void> => {
    elizaLogger.log("CronClient: start");

    const { agentId } = _runtime;
    const roomId = stringToUuid("default-room-" + agentId);
    const userId = stringToUuid(USER_NAME);

    const taskManager = new DefaultTaskManager(_runtime, roomId, userId, agentId);
    const triggerManager = new DefaultTriggerManager(_runtime, roomId, userId, agentId);

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
        id: stringToUuid(`${Date.now()}`).toString(),
        type: TriggerType.POLLING,
        params: { interval: 5000 }
      });
      elizaLogger.info("Polling trigger created");
    }

    // Initialize task manager
    await taskManager.initialize();
    elizaLogger.info('Current task status', { 
      hasCurrentTask: !!taskManager.currentTask,
      currentTaskDescription: taskManager.currentTask?.description 
    });

    // Ensure connection is established before starting main loop
    await _runtime.ensureConnection(
      userId,
      roomId,
      USER_NAME,
      USER_NAME,
      "direct"
    );

    while (true) {
      await iterate(_runtime, userId, roomId, USER_NAME, taskManager, triggerManager);
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Check every 5 seconds
    }
  },

  stop: async (_runtime: IAgentRuntime) => {
    elizaLogger.info("CronClient: Stopping client");
  },
};
