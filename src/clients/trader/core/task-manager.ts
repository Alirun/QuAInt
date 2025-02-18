import { IAgentRuntime, Memory, MemoryManager, State, composeContext, generateObject, ModelClass, stringToUuid, UUID } from "@elizaos/core";
import { z } from "zod";
import { Task, TaskManager, TaskMemory, TriggerType, Note } from "./types";
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
    const tasks = await this.getLatestTasks();
    // Find oldest non-completed task
    const nextTask = tasks
      .filter(t => t.status !== 'completed')
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    
    if (nextTask) {
      nextTask.status = 'in_progress';
      await this.updateTask(nextTask);
      this.currentTask = nextTask;
    }
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
    
    // If no current task, set this as current and mark as in_progress
    if (!this.currentTask) {
      task.status = 'in_progress';
      await this.updateTask(task);
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

    // Remove old memories for this task before creating new one
    await this.taskManager.removeMemory(stringToUuid(task.id));
    await this.taskManager.createMemory(memory);
    
    // Update current task if this is the current one
    if (this.currentTask?.id === task.id) {
      // If this task is completed, find and set the next task as in_progress
      if (task.status === 'completed') {
        const allTasks = await this.getLatestTasks();
        const nextTask = allTasks
          .filter(t => t.status !== 'completed')
          .sort((a, b) => a.createdAt - b.createdAt)[0];
        
        if (nextTask) {
          nextTask.status = 'in_progress';
          await this.taskManager.removeMemory(stringToUuid(nextTask.id));
          await this.taskManager.createMemory({
            id: stringToUuid(nextTask.id),
            roomId: this.roomId,
            userId: this.userId,
            agentId: this.agentId,
            content: {
              text: nextTask.description,
              description: nextTask.description,
              definitionOfDone: nextTask.definitionOfDone,
              status: nextTask.status,
              triggerTypes: nextTask.triggerTypes,
              data: nextTask.data,
              createdAt: nextTask.createdAt
            },
            createdAt: Date.now()
          });
          this.currentTask = nextTask;
        } else {
          this.currentTask = undefined;
        }
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

  // Get all tasks, but only the latest version of each task
  private async getLatestTasks(): Promise<Task[]> {
    const memories = await this.taskManager.getMemories({ roomId: this.roomId });
    
    // Group memories by task ID and get the latest version of each
    const latestMemories = new Map<string, Memory>();
    for (const memory of memories) {
      const existingMemory = latestMemories.get(memory.id);
      if (!existingMemory || memory.createdAt > existingMemory.createdAt) {
        latestMemories.set(memory.id, memory);
      }
    }

    return Array.from(latestMemories.values())
      .sort((a, b) => (a.content.createdAt as number) - (b.content.createdAt as number))
      .map(memory => ({
      id: memory.id,
      description: memory.content.description as string,
      definitionOfDone: memory.content.definitionOfDone as string,
      status: memory.content.status as Task['status'],
      triggerTypes: (memory.content.triggerTypes || []) as TriggerType[],
      data: memory.content.data as Record<string, any> | undefined,
      createdAt: memory.content.createdAt as number
    }));
  }

  // For backward compatibility
  async getAllTasks(): Promise<Task[]> {
    return this.getLatestTasks();
  }

  async getNextTasks(): Promise<Task[]> {
    const allTasks = await this.getLatestTasks();
    return allTasks.filter(t => t.status === 'pending');
  }

  private formatTask(task: Task): string {
    return `Description: ${task.description}\nStatus: ${task.status}\nDefinition of Done: ${task.definitionOfDone}`;
  }

  private formatTasks(tasks: Task[]): string {
    return tasks.map(task => 
      `- ${this.formatTask(task)}`
    ).join('\n');
  }

  async getCurrentTaskInfo(): Promise<string | null> {
    if (!this.currentTask) return null;
    return this.formatTask(this.currentTask);
  }

  async getNextTasksInfo(): Promise<string> {
    const nextTasks = await this.getNextTasks();
    return this.formatTasks(nextTasks);
  }

  async evaluateTaskCompletion(task: Task, state: State): Promise<boolean> {
    // Get task-specific notes
    const notes = (state.notes || []) as Note[];
    const taskNotes = notes.filter(note => note.metadata?.taskId === task.id);
    
    const formattedNotes = taskNotes.map(n => 
      `- Key: ${n.key}\n  Value: ${n.value}\n  Category: ${n.metadata?.category || 'N/A'}`
    ).join('\n');
    
    const context = composeContext({
      state: {
        ...state,
        description: task.description,
        definitionOfDone: task.definitionOfDone,
        taskNotes: formattedNotes
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
