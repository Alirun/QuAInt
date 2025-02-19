import { Client, elizaLogger, IAgentRuntime, stringToUuid } from "@elizaos/core";
import { TriggerType } from "./core/types";
import { DefaultTaskManager } from "./core/task-manager";
import { DefaultTriggerManager } from "./core/trigger-manager";
import { DefaultNoteManager } from "./core/note-manager";
import { initializeTasks } from "./tasks/init-tasks";
import { iterate } from "./client/iteration";
import { IterationMode, waitForNextIteration } from "./client/cli";

const USER_NAME = "Admin";

interface TraderClientConfig {
  iterationMode?: IterationMode;
  pollingInterval?: number;
}

export const TraderClient: Client = {
  start: async (_runtime: IAgentRuntime, config?: TraderClientConfig): Promise<void> => {
    elizaLogger.log("TraderClient: start");

    const { agentId } = _runtime;
    const roomId = stringToUuid("default-room-" + agentId);
    const userId = stringToUuid(USER_NAME);

    const taskManager = new DefaultTaskManager(_runtime, roomId, userId, agentId);
    const triggerManager = new DefaultTriggerManager(_runtime, roomId, userId, agentId);
    const noteManager = new DefaultNoteManager(_runtime, roomId, userId, agentId);

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

    // Ensure there's always one polling trigger with configured interval
    const triggers = await triggerManager.getAllTriggers();
    const hasPollingTrigger = triggers.some(t => t.type === TriggerType.POLLING);
    if (!hasPollingTrigger) {
      elizaLogger.info("Creating polling trigger");
      await triggerManager.addTrigger({
        id: stringToUuid(`${Date.now()}`).toString(),
        type: TriggerType.POLLING,
        params: { interval: config?.pollingInterval || 5000 }
      });
      elizaLogger.info("Polling trigger created");
    }

    // Log task status
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
    elizaLogger.info('Task status', { 
      totalTasks: tasks.length,
      inProgressCount: inProgressTasks.length,
      inProgressDescriptions: inProgressTasks.map(t => t.description)
    });

    // Ensure connection is established before starting main loop
    await _runtime.ensureConnection(
      userId,
      roomId,
      USER_NAME,
      USER_NAME,
      "direct"
    );

    const iterationMode = config?.iterationMode || 'sleep';
    const interval = config?.pollingInterval || 5000;

    elizaLogger.info(`Starting main loop in ${iterationMode} mode with ${interval}ms interval`);

    while (true) {
      await waitForNextIteration(iterationMode, interval);
      await iterate(_runtime, userId, roomId, taskManager, triggerManager, noteManager);
    }
  },

  stop: async (_runtime: IAgentRuntime) => {
    elizaLogger.info("TraderClient: Stopping client");
  },
};
