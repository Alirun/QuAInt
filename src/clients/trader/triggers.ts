import { IAgentRuntime, Memory, MemoryManager, State, composeContext, generateObject, ModelClass, stringToUuid, UUID, elizaLogger } from "@elizaos/core";
import { z } from "zod";
import { Trigger, TriggerManager, TriggerMemory, TriggerType } from "./types";

const triggerEvaluationTemplate = `
Evaluate if the following trigger condition is met based on recent conversations and market state:

Condition: {{condition}}

Recent conversations:
{{recentMessages}}

Respond with a JSON object:
{
  "isTriggered": true/false,
  "reason": "explanation"
}
`;

const TriggerEvaluationSchema = z.object({
  isTriggered: z.boolean(),
  reason: z.string()
}).strict();

export class DefaultTriggerManager implements TriggerManager {
  private triggerManager: MemoryManager;
  private roomId: UUID;
  private userId: UUID;
  private agentId: UUID;

  constructor(private runtime: IAgentRuntime, roomId: UUID, userId: UUID, agentId: UUID) {
    this.triggerManager = new MemoryManager({
      runtime,
      tableName: "triggers"
    });
    this.roomId = roomId;
    this.userId = userId;
    this.agentId = agentId;
  }

  async addTrigger(trigger: Trigger): Promise<void> {
    const memory: TriggerMemory = {
      id: stringToUuid(trigger.id),
      roomId: this.roomId,
      userId: this.userId,
      agentId: this.agentId,
      content: {
        text: `Trigger ${trigger.type}`,
        type: trigger.type,
        params: trigger.params
      },
      createdAt: Date.now()
    };

    await this.triggerManager.createMemory(memory);
  }

  async removeTrigger(triggerId: string): Promise<void> {
    await this.triggerManager.removeMemory(stringToUuid(triggerId));
  }

  async updateTrigger(trigger: Trigger): Promise<void> {
    const memory: TriggerMemory = {
      id: stringToUuid(trigger.id),
      roomId: this.roomId,
      userId: this.userId,
      agentId: this.agentId,
      content: {
        text: `Trigger ${trigger.type}`,
        type: trigger.type,
        params: trigger.params
      },
      createdAt: Date.now()
    };

    // In MemoryManager, update is done by creating a new memory
    await this.triggerManager.createMemory(memory);
  }

  async getTriggersByType(type: TriggerType): Promise<Trigger[]> {
    const memories = await this.triggerManager.getMemories({ roomId: this.roomId });
    return memories
      .filter(memory => memory.content.type === type)
      .map(memory => ({
        id: memory.id,
        type: memory.content.type as TriggerType,
        params: memory.content.params as Record<string, any>,
        lastCheck: memory.content.lastCheck as number | undefined
      }));
  }

  async getAllTriggers(): Promise<Trigger[]> {
    const memories = await this.triggerManager.getMemories({ roomId: this.roomId });
    return memories.map(memory => ({
      id: memory.id,
        type: memory.content.type as TriggerType,
      params: memory.content.params as Record<string, any>,
      lastCheck: memory.content.lastCheck as number | undefined
    }));
  }

  async evaluateTrigger(trigger: Trigger, state?: State): Promise<boolean> {
    if (trigger.type === TriggerType.POLLING) {
      // Polling trigger always returns true to indicate task should be reevaluated
      return true;
    }

    if (trigger.type === TriggerType.DYNAMIC) {
      const now = Date.now();
      if (!trigger.lastCheck || now - trigger.lastCheck >= trigger.params.interval) {
        trigger.lastCheck = now;
        await this.updateTrigger(trigger);
        
        if (!state) {
          elizaLogger.warn('No state provided for dynamic trigger evaluation, defaulting to false');
          return false;
        }

        const template = triggerEvaluationTemplate
          .replace('{{condition}}', trigger.params.condition);

        const context = composeContext({
          state,
          template
        });

        const evaluation = await generateObject({
          runtime: this.runtime,
          context,
          modelClass: ModelClass.SMALL,
          // @ts-ignore: Suppress zod version mismatch error
          schema: TriggerEvaluationSchema
        });

        return (evaluation.object as { isTriggered: boolean }).isTriggered;
      }
      return false;
    }

    if (trigger.type === TriggerType.PRICE) {
      // Here you would implement price trigger evaluation
      // This would typically involve checking current market prices
      // against the trigger's target price and direction
      elizaLogger.debug('Price trigger evaluation not implemented yet, defaulting to false');
      return false;
    }

    return false;
  }
}
