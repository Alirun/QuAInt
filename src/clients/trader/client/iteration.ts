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
  const tasks = await taskManager.getAllTasks();
  const inProgressTasks = tasks.filter(task => task.status === 'in_progress');

  // Sort tasks by order
  const sortedTasks = tasks.sort((a, b) => a.order - b.order);
  
  // Find the first non-completed task
  const nextTask = sortedTasks.find(task => task.status !== 'completed');
  
  if (!nextTask) {
    elizaLogger.debug('All tasks completed');
    return;
  }

  // If the task isn't in progress, start it
  if (nextTask.status === 'pending') {
    nextTask.status = 'in_progress';
    await taskManager.updateTask(nextTask);
    elizaLogger.info(`Starting task ${nextTask.order}: ${nextTask.description}`);
  }

  // Process the current task
  elizaLogger.info(`Processing task ${nextTask.order}: ${nextTask.description}`);
  await processTask(
    nextTask,
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
