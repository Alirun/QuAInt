import { messageCompletionFooter } from "@elizaos/core";

export const triggerHandlerTemplate =
  `
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Global Responsibilities and Guidelines

You are an autonomous trading agent and quantitative analyst specializing in crypto derivatives for a crypto hedge fund.
Your overarching mission is to continuously monitor the cryptocurrency market and execute data-driven trading strategies that generate profits while rigorously managing risk—all within the confines of a fixed account balance (no additional funds will be provided).
Your decisions must always align with the long-term goal of optimizing returns while strictly managing risk.

# Tasks
{{tasks}}

# Active Triggers
{{activeTriggers}}

# Relevant Notes
{{notes}}

# Available Trigger Types
1. POLLING - Regular interval checks (e.g., every 5 seconds)
   - Parameters:
     * interval: number - Check interval in milliseconds (default: 5000)

2. PRICE - Cryptocurrency price level monitoring
   - Parameters:
     * targetPrice: number - The price level to monitor
     * direction: "above" | "below" - Trigger when price moves above or below target
     * symbol: string - Trading pair symbol (e.g. "BTC-USD")

# Task: Generate dialog and actions for the {{agentName}}
(Explicitly specify action details in response text if they were requested by action description)

{{providers}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for the {{agentName}}.
` + messageCompletionFooter;

export const triggerAdjustmentTemplate = `
Based on the current task, next tasks, and recent conversations, determine what triggers should be active:

Current Task: {{currentTask}}

# Tasks
{{tasks}}

# Available Trigger Types

1. POLLING - Regular interval checks
   - Parameters:
     * interval: number - Check interval in milliseconds (default: 5000)

2. PRICE - Cryptocurrency price monitoring
   - Parameters:
     * targetPrice: number - The price level to monitor
     * direction: "above" | "below" - Trigger when price moves above or below target
     * symbol: string - Trading pair symbol (e.g. "BTC-USD")

# Active Triggers
{{activeTriggers}}

# Relevant Notes
{{notes}}

# Recent Conversations
{{recentMessages}}

Respond with a JSON array of triggers to set/modify/remove:
{
  "triggers": [
    {
      "type": "string",
      "params": object,
      "action": "add|remove|modify"
    }
  ]
}
`;

export const taskCompletionTemplate = `
Evaluate if the following task is complete based on recent conversations, market state, and relevant notes:

# Task
Description: {{description}}
Definition of Done: {{definitionOfDone}}

# Relevant Notes
{{taskNotes}}

# Recent Conversations
{{recentMessages}}

Respond with a JSON object:
{
  "isComplete": true/false,
  "reason": "explanation"
}
`;

export const triggerEvaluationTemplate = `
Evaluate if the following trigger condition is met based on recent conversations and market state:

# Condition
{{condition}}

# Relevant Notes
{{notes}}

# Recent Conversations
{{recentMessages}}

Respond with a JSON object:
{
  "isTriggered": true/false,
  "reason": "explanation",
  "response": object (optional),
  "timestamp": number
}
`;

export const noteEvaluationTemplate = `
Evaluate the current state and determine what notes should be managed:

# Tasks
{{tasks}}

# Existing Notes
{{notes}}

# Recent State
{{recentMessages}}
{{marketState}}

Respond with a JSON array of note operations:
{
  "notes": [
    {
      "action": "add|update|remove",
      "key": "string",
      "value": "any",
      "metadata": {
        "taskId": "string (optional)",
        "category": "string (optional)",
        "priority": "number (optional)",
        "tags": ["string"] (optional)
      },
      "reason": "explanation for this operation"
    }
  ]
}
`;
