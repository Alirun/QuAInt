import { Content, HandlerCallback, Memory, UUID, stringToUuid, elizaLogger } from "@elizaos/core";

export const createCallback = (
  messageId: UUID,
  agentId: UUID,
  roomId: UUID,
  messageManager: { createMemory: (memory: Memory) => Promise<void> }
): HandlerCallback => async (content: Content) => {
  elizaLogger.debug('Processing action callback', { 
    messageId,
    actionType: content.action,
    content 
  });

  const memory: Memory = {
    id: stringToUuid(messageId + "-" + agentId + "-" + content.action),
    roomId,
    agentId,
    userId: agentId,
    content,
    createdAt: Date.now()
  };

  await messageManager.createMemory(memory);

  return [memory];
};
