import { Memory, State } from "@elizaos/core";

export interface TraderState extends State {
  notes?: string;
  tasks?: string;
  activeTriggers?: string;
  rawNotes?: Note[];
  rawTasks?: Task[];
  rawTriggers?: Trigger[];
}

export enum TriggerType {
  POLLING = 'polling',
  PRICE = 'price',
  DYNAMIC = 'dynamic',
}

export interface TriggerEvaluation {
  isTriggered: boolean;
  reason: string;
  response?: any;
  timestamp: number;
}

export interface Trigger {
  id: string;
  type: TriggerType;
  params: Record<string, any>;
  lastCheck?: number;
  lastEvaluation?: TriggerEvaluation;
}

export interface Task {
  id: string;
  description: string;
  definitionOfDone: string;
  status: 'pending' | 'in_progress' | 'completed';
  triggerTypes: TriggerType[];
  data?: Record<string, any>;
  order: number;  // Explicit ordering for sequential execution
  createdAt: number;
}

export interface Note {
  id: string;
  key: string;
  value: any;
  metadata?: {
    taskId?: string;
    category?: string;
    priority?: number;
    tags?: string[];
  };
  timestamp: number;
}

export interface TaskManager {
  addTask(task: Task): Promise<void>;
  updateTask(task: Task): Promise<void>;
  getTask(taskId: string): Promise<Task | null>;
  getAllTasks(): Promise<Task[]>;
  evaluateTaskCompletion(task: Task, state: TraderState): Promise<boolean>;
}

export interface TriggerManager {
  addTrigger(trigger: Trigger): Promise<void>;
  removeTrigger(triggerId: string): Promise<void>;
  updateTrigger(trigger: Trigger): Promise<void>;
  getTriggersByType(type: TriggerType): Promise<Trigger[]>;
  getAllTriggers(): Promise<Trigger[]>;
  evaluateTrigger(trigger: Trigger, state?: State): Promise<TriggerEvaluation>;
  evaluateAndAdjustTriggers(state: State): Promise<void>;
}

export interface NoteManager {
  addNote(key: string, value: any, metadata?: Note['metadata']): Promise<void>;
  updateNote(key: string, value: any, metadata?: Note['metadata']): Promise<void>;
  removeNote(key: string): Promise<void>;
  getNote(key: string): Promise<Note | null>;
  getAllNotes(): Promise<Note[]>;
  getNotesByTask(taskId: string): Promise<Note[]>;
  evaluateNotes(state: State): Promise<void>;
}

export interface TaskMemory extends Memory {
  content: {
    text: string;
    description: string;
    definitionOfDone: string;
    status: Task['status'];
    triggerTypes: TriggerType[];
    data?: Record<string, any>;
    order: number;
    createdAt: number;
  };
}

export interface TriggerMemory extends Memory {
  content: {
    text: string;
    type: TriggerType;
    params: Record<string, any>;
    evaluation?: TriggerEvaluation;
  };
}

export interface NoteMemory extends Memory {
  content: {
    text: string;
    key: string;
    value: any;
    metadata?: Note['metadata'];
    timestamp: number;
  };
}
