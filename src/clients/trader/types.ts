import { Memory, State } from "@elizaos/core";

export enum TriggerType {
  POLLING = 'polling',
  PRICE = 'price',
  DYNAMIC = 'dynamic',
}

export interface Trigger {
  id: string;
  type: TriggerType;
  params: Record<string, any>;
  lastCheck?: number;
}

export interface Task {
  id: string;
  description: string;
  definitionOfDone: string;
  status: 'pending' | 'in_progress' | 'completed';
  triggerTypes: TriggerType[];
  data?: Record<string, any>;
  createdAt: number;
}

export interface TaskManager {
  currentTask?: Task;
  addTask(task: Task): Promise<void>;
  updateTask(task: Task): Promise<void>;
  getTask(taskId: string): Promise<Task | null>;
  getAllTasks(): Promise<Task[]>;
}

export interface TriggerManager {
  addTrigger(trigger: Trigger): Promise<void>;
  removeTrigger(triggerId: string): Promise<void>;
  updateTrigger(trigger: Trigger): Promise<void>;
  getTriggersByType(type: TriggerType): Promise<Trigger[]>;
  getAllTriggers(): Promise<Trigger[]>;
}

export interface TaskMemory extends Memory {
  content: {
    text: string;
    description: string;
    definitionOfDone: string;
    status: Task['status'];
    triggerTypes: TriggerType[];
    data?: Record<string, any>;
    createdAt: number;
  };
}

export interface TriggerMemory extends Memory {
  content: {
    text: string;
    type: TriggerType;
    params: Record<string, any>;
  };
}
