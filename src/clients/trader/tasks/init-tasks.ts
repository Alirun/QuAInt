import { DefaultTaskManager } from "../core/task-manager";
import { stringToUuid } from "@elizaos/core";
import { Task, TriggerType } from "../core/types";

export async function initializeTasks(taskManager: DefaultTaskManager) {
  const timestamp = Date.now();
  const tasks: Task[] = [
    {
      id: stringToUuid("analyze-market").toString(),
      createdAt: timestamp,
      description: "Analyze market and find the most profitable option call to sell",
      definitionOfDone: "Identified the most profitable option call based on market analysis, including strike price, expiration, and expected profit potential",
      status: "pending",
      triggerTypes: [TriggerType.POLLING], // Regular market analysis
      data: {
        type: "market_analysis",
        parameters: {
          optionType: "call",
          position: "sell"
        }
      }
    },
    {
      id: stringToUuid("open-position").toString(),
      createdAt: timestamp + 1,
      description: "Open position",
      definitionOfDone: "Successfully opened the identified option position with confirmation of execution",
      status: "pending",
      triggerTypes: [TriggerType.PRICE], // Execute when price conditions are met
      data: {
        type: "trade_execution",
        action: "open"
      }
    },
    {
      id: stringToUuid("close-position").toString(),
      createdAt: timestamp + 2,
      description: "Close position and take profit",
      definitionOfDone: "Successfully closed the position with profit target achieved",
      status: "pending",
      triggerTypes: [TriggerType.PRICE], // Execute when profit target is reached
      data: {
        type: "trade_execution",
        action: "close"
      }
    }
  ];

  // Add tasks in sequence
  for (const task of tasks) {
    await taskManager.addTask(task);
  }
}
