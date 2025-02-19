import { IAgentRuntime, Memory } from "@elizaos/core";
import { formatters } from "./formatters";
import { DefaultTaskManager } from "../core/task-manager";
import { DefaultNoteManager } from "../core/note-manager";
import { DefaultTriggerManager } from "../core/trigger-manager";
import { TraderState } from "../core/types";

export async function composeStateWithDefaults(
  runtime: IAgentRuntime,
  memory: Memory,
  taskManager: DefaultTaskManager,
  triggerManager: DefaultTriggerManager,
  noteManager: DefaultNoteManager
): Promise<TraderState> {
  const baseState = await runtime.composeState(memory, {
    agentName: runtime.character.name
  });

  // Get all data
  const tasks = await taskManager.getAllTasks();
  const notes = await noteManager.getAllNotes();
  const triggers = await triggerManager.getAllTriggers();

  // Compose state with both formatted and raw data
  return {
    ...baseState,
    tasks: formatters.tasks(tasks),
    notes: formatters.notes(notes),
    activeTriggers: formatters.triggers(triggers),
    rawTasks: tasks,
    rawNotes: notes,
    rawTriggers: triggers
  };
}
