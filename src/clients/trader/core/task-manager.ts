import { IAgentRuntime, Memory, MemoryManager, State, composeContext, generateObject, ModelClass, stringToUuid, UUID } from "@elizaos/core";
import { z } from "zod";
import { Task, TaskManager, TaskMemory, TriggerType, Note, TraderState } from "./types";
import { taskCompletionTemplate } from "../constants/templates";

type TaskCompletion = {
  isComplete: boolean;
  reason: string;
};

const TaskCompletionSchema = z.object({
  isComplete: z.boolean(),
  reason: z.string()
}) as z.ZodType<TaskCompletion>;

export class DefaultTaskManager implements TaskManager {
  private taskManager: MemoryManager;
  private roomId: UUID;
  private userId: UUID;
  private agentId: UUID;

  constructor(private runtime: IAgentRuntime, roomId: UUID, userId: UUID, agentId: UUID) {
    this.taskManager = new MemoryManager({
      runtime,
      tableName: "tasks"
    });
    this.roomId = roomId;
    this.userId = userId;
    this.agentId = agentId;
  }

  async addTask(task: Task): Promise<void> {
    const timestamp = Date.now();
    task.createdAt = timestamp;
    
    // If order is not provided, set it to the highest order + 1
    if (task.order === undefined) {
      const tasks = await this.getLatestTasks();
      const maxOrder = tasks.reduce((max, t) => Math.max(max, t.order), -1);
      task.order = maxOrder + 1;
    }
    
    const memory: TaskMemory = {
      id: stringToUuid(task.id),
      roomId: this.roomId,
      userId: this.userId,
      agentId: this.agentId,
      content: {
        text: task.description,
        description: task.description,
        definitionOfDone: task.definitionOfDone,
        status: task.status,
        triggerTypes: task.triggerTypes,
        data: task.data,
        order: task.order,
        createdAt: timestamp
      },
      createdAt: timestamp
    };

    await this.taskManager.createMemory(memory);
  }

  async updateTask(task: Task): Promise<void> {
    // Get all existing memories
    const memories = await this.taskManager.getMemories({ roomId: this.roomId });
    
    // Remove all memories for this task
    for (const memory of memories) {
      if (memory.id.toString() === task.id) {
        await this.taskManager.removeMemory(memory.id);
      }
    }

    // Create new memory
    const memory: TaskMemory = {
      id: stringToUuid(task.id),
      roomId: this.roomId,
      userId: this.userId,
      agentId: this.agentId,
      content: {
        text: task.description,
        description: task.description,
        definitionOfDone: task.definitionOfDone,
        status: task.status,
        triggerTypes: task.triggerTypes,
        data: task.data,
        order: task.order,
        createdAt: task.createdAt
      },
      createdAt: Date.now()
    };

    await this.taskManager.createMemory(memory);
  }

  async getTask(taskId: string): Promise<Task | null> {
    const memories = await this.taskManager.getMemories({ roomId: this.roomId });
    const memory = memories.find(m => m.id === stringToUuid(taskId));
    
    if (!memory) return null;

    return {
      id: memory.id,
      description: memory.content.description as string,
      definitionOfDone: memory.content.definitionOfDone as string,
      status: memory.content.status as Task['status'],
      triggerTypes: (memory.content.triggerTypes || []) as TriggerType[],
      data: memory.content.data as Record<string, any> | undefined,
      order: memory.content.order as number,
      createdAt: memory.content.createdAt as number
    };
  }

  // Get all tasks, but only the latest version of each task
  private async getLatestTasks(): Promise<Task[]> {
    const memories = await this.taskManager.getMemories({ roomId: this.roomId });
    
    // Group memories by task ID and get the latest version of each
    const latestMemories = new Map<string, Memory>();
    for (const memory of memories) {
      // Use task ID from content as the key, not the memory ID
      const taskId = memory.id.toString();
      const existingMemory = latestMemories.get(taskId);
      if (!existingMemory || memory.createdAt > existingMemory.createdAt) {
        latestMemories.set(taskId, memory);
      }
    }

    return Array.from(latestMemories.values())
      .sort((a, b) => (a.content.order as number) - (b.content.order as number))
      .map(memory => ({
      id: memory.id,
      description: memory.content.description as string,
      definitionOfDone: memory.content.definitionOfDone as string,
      status: memory.content.status as Task['status'],
      triggerTypes: (memory.content.triggerTypes || []) as TriggerType[],
      data: memory.content.data as Record<string, any> | undefined,
      order: memory.content.order as number,
      createdAt: memory.content.createdAt as number
    }));
  }

  async getAllTasks(): Promise<Task[]> {
    return this.getLatestTasks();
  }

  async evaluateTaskCompletion(task: Task, state: TraderState): Promise<boolean> {
    const context = composeContext({
      state: {
        ...state,
        description: task.description,
        definitionOfDone: task.definitionOfDone
      },
      template: taskCompletionTemplate
    });

    try {
      const evaluation = await generateObject({
        runtime: this.runtime,
        context,
        modelClass: ModelClass.SMALL,
        // @ts-ignore
        schema: TaskCompletionSchema
      });

      const result = evaluation.object as TaskCompletion;
      
      // Create memory for task completion evaluation
      const completionMemory: Memory = {
        id: stringToUuid(`${Date.now()}-task-completion`),
        roomId: this.roomId,
        userId: this.userId,
        agentId: this.agentId,
        content: {
          text: `Task completion evaluation: ${result.reason}`,
          taskId: task.id,
          taskDescription: task.description,
          isComplete: result.isComplete,
          reason: result.reason
        },
        createdAt: Date.now()
      };
      await this.runtime.messageManager.createMemory(completionMemory);
      
      return result.isComplete;
    } catch (error) {
      return false;
    }
  }
}
