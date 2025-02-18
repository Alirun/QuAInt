import { IAgentRuntime, Memory, State } from "@elizaos/core";
import { formatters } from "./formatters";
import { DefaultTaskManager } from "../core/task-manager";
import { DefaultNoteManager } from "../core/note-manager";

export interface StateCompositionOptions {
  includeNotes?: boolean;
  includeTasks?: boolean;
  includeCurrentTask?: boolean;
  includeNextTasks?: boolean;
}

export async function composeStateWithDefaults(
  runtime: IAgentRuntime,
  memory: Memory,
  taskManager?: DefaultTaskManager,
  noteManager?: DefaultNoteManager,
  options: StateCompositionOptions = {}
): Promise<State> {
  const {
    includeNotes = true,
    includeTasks = true,
    includeCurrentTask = true,
    includeNextTasks = false
  } = options;

  const baseState = await runtime.composeState(memory, {
    agentName: runtime.character.name
  });

  const stateExtensions: Partial<State> = {};

  if (includeTasks && taskManager) {
    const allTasks = await taskManager.getAllTasks();
    stateExtensions.tasks = formatters.tasks(allTasks);
  }

  if (includeNotes && noteManager) {
    const notes = await noteManager.getAllNotes();
    stateExtensions.notes = formatters.notes(notes);
  }

  if (includeCurrentTask && taskManager) {
    const currentTaskInfo = await taskManager.getCurrentTaskInfo();
    if (currentTaskInfo) {
      stateExtensions.currentTask = currentTaskInfo;
    }
  }

  if (includeNextTasks && taskManager) {
    const nextTasksInfo = await taskManager.getNextTasksInfo();
    if (nextTasksInfo) {
      stateExtensions.nextTasks = nextTasksInfo;
    }
  }

  return {
    ...baseState,
    ...stateExtensions
  };
}
