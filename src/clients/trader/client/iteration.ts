import { IAgentRuntime, Memory, UUID, elizaLogger, Content, HandlerCallback, IMemoryManager } from "@elizaos/core";
import { DefaultTaskManager } from "../core/task-manager";
import { DefaultTriggerManager } from "../core/trigger-manager";
import { DefaultNoteManager } from "../core/note-manager";
import { processTask } from "../tasks/processor";

const createCallback = (
  messageId: UUID,
  agentId: UUID,
  roomId: UUID,
  userId: UUID,
  messageManager: IMemoryManager
): HandlerCallback => async (content: Content): Promise<Memory[]> => {
  elizaLogger.log('Processing action callback', { 
    messageId,
    actionType: content.action,
    content 
  });

  const memory: Memory = {
    id: `${messageId}-action-${Date.now()}`,
    roomId,
    agentId,
    userId,
    content: {
      ...content,
      originalMessageId: messageId
    },
    createdAt: Date.now()
  };

  await messageManager.createMemory(memory);
  return [memory];
};

export async function iterate(
  runtime: IAgentRuntime,
  userId: UUID,
  roomId: UUID,
  taskManager: DefaultTaskManager,
  triggerManager: DefaultTriggerManager,
  noteManager: DefaultNoteManager
): Promise<void> {
  const currentTask = taskManager.currentTask;
  if (!currentTask) {
    elizaLogger.debug('No current task to process');
    return;
  }

  elizaLogger.info(`Processing task: ${currentTask.description}`);
  await processTask(
    currentTask,
    runtime,
    taskManager,
    triggerManager,
    noteManager,
    roomId,
    (messageId: UUID) => createCallback(
      messageId,
      runtime.agentId,
      roomId,
      userId,
      runtime.messageManager
    )
  );
}
