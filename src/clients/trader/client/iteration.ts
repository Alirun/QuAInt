import { elizaLogger, IAgentRuntime, UUID } from "@elizaos/core";
import { DefaultTaskManager } from "../core/task-manager";
import { processTask } from "../tasks/processor";
import { DefaultTriggerManager } from "../core/trigger-manager";
import { createCallback } from "./callback";

export async function iterate(
  runtime: IAgentRuntime,
  userId: UUID,
  roomId: UUID,
  userName: string,
  taskManager: DefaultTaskManager,
  triggerManager: DefaultTriggerManager
): Promise<void> {
  elizaLogger.info("CronClient: Starting iteration");

  // Process current task if exists
  elizaLogger.debug('Checking for current task...');
  const currentTask = taskManager.currentTask;
  if (currentTask) {
    elizaLogger.info(`Found current task: ${currentTask.description}`);
    await processTask(
      currentTask,
      runtime,
      taskManager,
      triggerManager,
      roomId,
      (messageId) => createCallback(messageId, runtime.agentId, roomId, runtime.messageManager)
    );
  } else {
    elizaLogger.warn('No current task available - task manager may need initialization');
  }
}
