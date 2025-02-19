import { DefaultTaskManager } from "../core/task-manager";
import { stringToUuid } from "@elizaos/core";
import { Task, TriggerType } from "../core/types";

export async function initializeTasks(taskManager: DefaultTaskManager) {
  const timestamp = Date.now();
  const tasks: Task[] = [
    {
      id: stringToUuid("analyze-market").toString(),
      createdAt: timestamp,
      order: 0,
      description: "Analyze cryptocurrency market to identify the most profitable option call to sell, considering volatility, liquidity, and market trends",
      definitionOfDone: "Identified optimal option call with detailed analysis of: strike price, expiration date, premium, expected profit, and risk assessment",
      status: "pending",
      triggerTypes: [TriggerType.POLLING],
      data: {
        type: "market_analysis",
        parameters: {
          optionType: "call",
          position: "sell"
        },
        triggerUsage: {
          [TriggerType.POLLING]: "Regular market analysis to continuously monitor market conditions and identify optimal entry points"
        }
      }
    },
    {
      id: stringToUuid("open-position").toString(),
      createdAt: timestamp,
      order: 1,
      description: "Execute option sell order based on market analysis findings",
      definitionOfDone: "Successfully placed and confirmed sell order for the identified option call with specified parameters (strike, expiry, quantity)",
      status: "pending",
      triggerTypes: [TriggerType.POLLING],
      data: {
        type: "trade_execution",
        action: "open",
        triggerUsage: {
          [TriggerType.POLLING]: "Regular checks to monitor order placement status and confirm execution details"
        }
      }
    },
    {
      id: stringToUuid("monitor-position").toString(),
      createdAt: timestamp,
      order: 2,
      description: "Monitor option position for profit target or stop-loss levels",
      definitionOfDone: "Detected when position should be closed based on profit target or stop-loss conditions",
      status: "pending",
      triggerTypes: [TriggerType.PRICE],
      data: {
        type: "position_monitoring",
        action: "monitor",
        triggerUsage: {
          [TriggerType.PRICE]: "Monitor specific price levels to detect when profit target or stop-loss levels are reached"
        }
      }
    },
    {
      id: stringToUuid("close-position").toString(),
      createdAt: timestamp,
      order: 3,
      description: "Execute option position closure",
      definitionOfDone: "Successfully closed the position with full execution confirmation",
      status: "pending",
      triggerTypes: [TriggerType.POLLING],
      data: {
        type: "trade_execution",
        action: "close",
        triggerUsage: {
          [TriggerType.POLLING]: "Regular checks to monitor position closure status and confirm execution details"
        }
      }
    }
  ];

  // Add tasks in sequence
  for (const task of tasks) {
    await taskManager.addTask(task);
  }
}
