import { IAgentRuntime, Memory, MemoryManager, State, composeContext, generateObject, ModelClass, stringToUuid, UUID, elizaLogger } from "@elizaos/core";
import { z } from "zod";
import { Note, NoteManager, NoteMemory } from "./types";
import { noteEvaluationTemplate } from "../constants/templates";

const NoteOperationSchema = z.object({
  action: z.enum(['add', 'update', 'remove']),
  key: z.string(),
  value: z.any(),
  metadata: z.object({
    taskId: z.string().optional(),
    category: z.string().optional(),
    priority: z.number().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
  reason: z.string()
}).strict();

const NoteOperationsSchema = z.object({
  notes: z.array(NoteOperationSchema)
}).strict();

type NoteOperations = z.infer<typeof NoteOperationsSchema>;

export class DefaultNoteManager implements NoteManager {
  private noteManager: MemoryManager;
  private roomId: UUID;
  private userId: UUID;
  private agentId: UUID;

  constructor(private runtime: IAgentRuntime, roomId: UUID, userId: UUID, agentId: UUID) {
    this.noteManager = new MemoryManager({
      runtime,
      tableName: "notes"
    });
    this.roomId = roomId;
    this.userId = userId;
    this.agentId = agentId;
  }

  private generateNoteId(timestamp: number): UUID {
    return `${timestamp}-0000-4000-8000-000000000000` as UUID;
  }

  async addNote(key: string, value: any, metadata?: Note['metadata']): Promise<void> {
    const timestamp = Date.now();
    const note: NoteMemory = {
      id: this.generateNoteId(timestamp),
      roomId: this.roomId,
      userId: this.userId,
      agentId: this.agentId,
      content: {
        text: `Note: ${key}`,
        key,
        value,
        metadata,
        timestamp
      },
      createdAt: timestamp
    };

    await this.noteManager.createMemory(note);
  }

  async updateNote(key: string, value: any, metadata?: Note['metadata']): Promise<void> {
    const existingNote = await this.getNote(key);
    if (!existingNote) {
      throw new Error(`Note with key ${key} not found`);
    }

    const timestamp = Date.now();
    const note: NoteMemory = {
      id: this.generateNoteId(timestamp),
      roomId: this.roomId,
      userId: this.userId,
      agentId: this.agentId,
      content: {
        text: `Note: ${key}`,
        key,
        value,
        metadata: metadata || existingNote.metadata,
        timestamp
      },
      createdAt: timestamp
    };

    // Use the UUID type directly
    await this.noteManager.removeMemory(existingNote.id as UUID);
    await this.noteManager.createMemory(note);
  }

  async removeNote(key: string): Promise<void> {
    const note = await this.getNote(key);
    if (note) {
      // Use the UUID type directly
      await this.noteManager.removeMemory(note.id as UUID);
    }
  }

  async getNote(key: string): Promise<Note | null> {
    const memories = await this.noteManager.getMemories({ roomId: this.roomId });
    const memory = memories.find(m => m.content.key === key);
    
    if (!memory) return null;

    return {
      id: memory.id,
      key: memory.content.key as string,
      value: memory.content.value,
      metadata: memory.content.metadata as Note['metadata'],
      timestamp: memory.content.timestamp as number
    };
  }

  async getAllNotes(): Promise<Note[]> {
    const memories = await this.noteManager.getMemories({ roomId: this.roomId });
    return memories.map(memory => ({
      id: memory.id,
      key: memory.content.key as string,
      value: memory.content.value,
      metadata: memory.content.metadata as Note['metadata'],
      timestamp: memory.content.timestamp as number
    }));
  }

  async getNotesByTask(taskId: string): Promise<Note[]> {
    const notes = await this.getAllNotes();
    return notes.filter(note => note.metadata?.taskId === taskId);
  }

  private formatNote(note: Note): string {
    const tags = note.metadata?.tags ? note.metadata.tags.join(', ') : 'N/A';
    return `- Key: ${note.key}
  Value: ${note.value}
  Category: ${note.metadata?.category || 'N/A'}
  Priority: ${note.metadata?.priority || 'N/A'}
  Task ID: ${note.metadata?.taskId || 'N/A'}
  Tags: ${tags}`;
  }

  private formatNotes(notes: Note[]): string {
    return notes.map(note => this.formatNote(note)).join('\n');
  }

  async evaluateNotes(state: State): Promise<void> {
    elizaLogger.debug('Evaluating notes...');
    
    const notes = await this.getAllNotes();
    const formattedNotes = this.formatNotes(notes);
    
    const context = composeContext({
      state: {
        ...state,
        currentTask: state.currentTask || '',
        nextTasks: state.nextTasks || '',
        notes: formattedNotes,
        marketState: JSON.stringify(state.marketState || {}, null, 2)
      },
      template: noteEvaluationTemplate
    });

    try {
      const result = await generateObject({
        runtime: this.runtime,
        context,
        modelClass: ModelClass.SMALL,
        // @ts-ignore: Suppress zod version mismatch error
        schema: NoteOperationsSchema
      });

      const evaluation = result.object as NoteOperations;
      elizaLogger.debug('Processing note operations...', { operationCount: evaluation.notes.length });

      for (const operation of evaluation.notes) {
        elizaLogger.debug('Processing note operation', { 
          action: operation.action,
          key: operation.key,
          reason: operation.reason
        });

        switch (operation.action) {
          case 'add':
            await this.addNote(operation.key, operation.value, operation.metadata);
            break;
          case 'update':
            await this.updateNote(operation.key, operation.value, operation.metadata);
            break;
          case 'remove':
            await this.removeNote(operation.key);
            break;
        }
      }
    } catch (error) {
      elizaLogger.error('Error evaluating notes:', error);
    }
  }
}
