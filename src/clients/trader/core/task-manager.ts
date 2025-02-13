import { IAgentRuntime, Memory, MemoryManager, State, composeContext, generateObject, ModelClass, stringToUuid, UUID } from "@elizaos/core";
import { z } from "zod";
import { Task, TaskManager, TaskMemory, TriggerType } from "./types";
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
  currentTask?: Task;

  constructor(private runtime: IAgentRuntime, roomId: UUID, userId: UUID, agentId: UUID) {
    this.taskManager = new MemoryManager({
      runtime,
      tableName: "tasks"
    });
    this.roomId = roomId;
    this.userId = userId;
    this.agentId = agentId;
  }

  async initialize(): Promise<void> {
    const tasks = await this.getAllTasks();
    // Find oldest non-completed task
    this.currentTask = tasks
      .filter(t => t.status !== 'completed')
      .sort((a, b) => a.createdAt - b.createdAt)[0];
  }

  async addTask(task: Task): Promise<void> {
    const timestamp = Date.now();
    task.createdAt = timestamp;
    
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
        createdAt: timestamp
      },
      createdAt: timestamp
    };

    await this.taskManager.createMemory(memory);
    
    // If no current task, set this as current
    if (!this.currentTask) {
      this.currentTask = task;
    }
  }

  async updateTask(task: Task): Promise<void> {
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
        createdAt: task.createdAt
      },
      createdAt: Date.now()
    };

    await this.taskManager.createMemory(memory);
    
    // Update current task if this is the current one
    if (this.currentTask?.id === task.id) {
      // If this task is completed, find the next incomplete task by creation date
      if (task.status === 'completed') {
        const allTasks = await this.getAllTasks();
        this.currentTask = allTasks
          .filter(t => t.status !== 'completed')
          .sort((a, b) => a.createdAt - b.createdAt)[0];
      } else {
        this.currentTask = task;
      }
    }
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
      createdAt: memory.content.createdAt as number
    };
  }

  async getAllTasks(): Promise<Task[]> {
    const memories = await this.taskManager.getMemories({ roomId: this.roomId });
    return memories.map(memory => ({
      id: memory.id,
      description: memory.content.description as string,
      definitionOfDone: memory.content.definitionOfDone as string,
      status: memory.content.status as Task['status'],
      triggerTypes: (memory.content.triggerTypes || []) as TriggerType[],
      data: memory.content.data as Record<string, any> | undefined,
      createdAt: memory.content.createdAt as number
    }));
  }

  async evaluateTaskCompletion(task: Task, state: State): Promise<boolean> {
    const template = taskCompletionTemplate
      .replace('{{description}}', task.description)
      .replace('{{definitionOfDone}}', task.definitionOfDone);

    const context = composeContext({
      state,
      template
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
      return result.isComplete;
    } catch (error) {
      return false;
    }
  }
}
