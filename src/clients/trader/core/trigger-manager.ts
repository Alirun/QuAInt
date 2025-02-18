import { IAgentRuntime, Memory, MemoryManager, State, composeContext, generateObject, ModelClass, stringToUuid, UUID, elizaLogger } from "@elizaos/core";
import { z } from "zod";
import { Trigger, TriggerManager, TriggerMemory, TriggerType, TriggerEvaluation } from "./types";
import { triggerEvaluationTemplate, triggerAdjustmentTemplate } from "../constants/templates";

const TriggerEvaluationSchema = z.object({
  isTriggered: z.boolean(),
  reason: z.string(),
  response: z.any().optional(),
  timestamp: z.number()
}).strict();

const TriggerAdjustmentSchema = z.object({
  triggers: z.array(z.object({
    type: z.nativeEnum(TriggerType),
    params: z.record(z.any()),
    action: z.enum(['add', 'remove', 'modify']),
    id: z.string().optional()
  }))
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
    // For polling triggers, ensure only one exists
    if (trigger.type === TriggerType.POLLING) {
      const existingPolling = await this.getTriggersByType(TriggerType.POLLING);
      if (existingPolling.length > 0) {
        elizaLogger.warn('Polling trigger already exists, skipping addition of new polling trigger');
        return;
      }
      // Validate polling trigger interval
      if (!trigger.params.interval || typeof trigger.params.interval !== 'number' || trigger.params.interval < 1000) {
        trigger.params.interval = 5000; // Default to 5 seconds if invalid
      }
    }

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
    // Prevent modification of polling triggers
    if (trigger.type === TriggerType.POLLING) {
      elizaLogger.warn('Modification of polling triggers is not allowed');
      return;
    }

    const memory: TriggerMemory = {
      id: stringToUuid(trigger.id),
      roomId: this.roomId,
      userId: this.userId,
      agentId: this.agentId,
      content: {
        text: `Trigger ${trigger.type}`,
        type: trigger.type,
        params: trigger.params,
        evaluation: trigger.lastEvaluation
      },
      createdAt: Date.now()
    };

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
        lastCheck: memory.content.lastCheck as number | undefined,
        lastEvaluation: memory.content.evaluation as TriggerEvaluation | undefined
      }));
  }

  async getAllTriggers(): Promise<Trigger[]> {
    const memories = await this.triggerManager.getMemories({ roomId: this.roomId });
    return memories.map(memory => ({
      id: memory.id,
      type: memory.content.type as TriggerType,
      params: memory.content.params as Record<string, any>,
      lastCheck: memory.content.lastCheck as number | undefined,
      lastEvaluation: memory.content.evaluation as TriggerEvaluation | undefined
    }));
  }

  // State is temporary useless and considered deprecated for now
  async evaluateAndAdjustTriggers(state: State): Promise<void> {
    elizaLogger.debug('Generating trigger adjustments...');
    
    const context = composeContext({
      state: {
        ...state,
        currentTask: state.currentTask || '',
        tasks: state.tasks || '',
        activeTriggers: state.activeTriggers || '',
        notes: state.notes || ''
      },
      template: triggerAdjustmentTemplate
    });

    try {
      const result = await generateObject({
        runtime: this.runtime,
        context,
        modelClass: ModelClass.SMALL,
        // @ts-ignore: Suppress zod version mismatch error
        schema: TriggerAdjustmentSchema
      });

      const adjustments = result.object as z.infer<typeof TriggerAdjustmentSchema>;
      elizaLogger.info(`Processing ${adjustments.triggers.length} trigger adjustments`);

      for (const trigger of adjustments.triggers) {
        elizaLogger.debug('Processing trigger adjustment', { action: trigger.action, type: trigger.type });
        switch (trigger.action) {
          case 'add':
            await this.addTrigger({
              id: stringToUuid(`${Date.now()}`).toString(),
              type: trigger.type,
              params: trigger.params
            });
            break;
          case 'remove':
            if (trigger.id) {
              await this.removeTrigger(trigger.id);
            }
            break;
          case 'modify':
            if (trigger.id) {
              await this.updateTrigger({
                id: trigger.id,
                type: trigger.type,
                params: trigger.params
              });
            }
            break;
        }
      }
    } catch (error) {
      elizaLogger.error('Error adjusting triggers:', error);
    }
  }

  async evaluateTrigger(trigger: Trigger, state?: State): Promise<TriggerEvaluation> {
    const now = Date.now();

    if (trigger.type === TriggerType.POLLING) {
      const interval = trigger.params.interval || 5000;
      if (!trigger.lastCheck || now - trigger.lastCheck >= interval) {
        const evaluation: TriggerEvaluation = {
          isTriggered: true,
          reason: 'Proceed with the action',
          timestamp: now
        };
        trigger.lastCheck = now;
        trigger.lastEvaluation = evaluation;
        await this.updateTrigger(trigger);
        return evaluation;
      }
      return {
        isTriggered: false,
        reason: `Polling interval of ${trigger.params.interval}ms has not elapsed`,
        timestamp: now
      };
    }

    if (trigger.type === TriggerType.DYNAMIC) {
      const interval = trigger.params.interval || 5000;
      if (!trigger.lastCheck || now - trigger.lastCheck >= interval) {
        trigger.lastCheck = now;

        if (!trigger.params.condition) {
          elizaLogger.warn('No condition provided for dynamic trigger evaluation, defaulting to false');
          return {
            isTriggered: false,
            reason: 'No condition provided for evaluation',
            timestamp: now
          };
        }

        if (!state) {
          elizaLogger.warn('No state provided for dynamic trigger evaluation, defaulting to false');
          return {
            isTriggered: false,
            reason: 'No state provided for evaluation',
            timestamp: now
          };
        }

        const template = triggerEvaluationTemplate
          .replace('{{condition}}', trigger.params.condition);

        const context = composeContext({
          state,
          template
        });

        try {
          const evaluation = await generateObject({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.SMALL,
            // @ts-ignore: Suppress zod version mismatch error
            schema: TriggerEvaluationSchema
          });

          const result = evaluation.object as TriggerEvaluation;
          trigger.lastEvaluation = result;
          await this.updateTrigger(trigger);
          return result;
        } catch (error) {
          elizaLogger.error('Error evaluating dynamic trigger:', error);
          return {
            isTriggered: false,
            reason: `Error evaluating trigger: ${error.message}`,
            timestamp: now
          };
        }
      }
      return {
        isTriggered: false,
        reason: `Dynamic trigger interval of ${trigger.params.interval}ms has not elapsed`,
        timestamp: now
      };
    }

    if (trigger.type === TriggerType.PRICE) {
      // Here you would implement price trigger evaluation
      // This would typically involve checking current market prices
      // against the trigger's target price and direction
      elizaLogger.debug('Price trigger evaluation not implemented yet, defaulting to false');
      return {
        isTriggered: false,
        reason: 'Price trigger evaluation not implemented',
        timestamp: now
      };
    }

    return {
      isTriggered: false,
      reason: `Unknown trigger type: ${trigger.type}`,
      timestamp: now
    };
  }
}
