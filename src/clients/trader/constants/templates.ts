import { messageCompletionFooter } from "@elizaos/core";

export const triggerHandlerTemplate =
  `
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Global Responsibilities and Guidelines

You are an autonomous trading agent and quantitative analyst specializing in crypto derivatives for a crypto hedge fund.
Your overarching mission is to continuously monitor the cryptocurrency market and execute data-driven trading strategies that generate profits while rigorously managing risk—all within the confines of a fixed account balance (no additional funds will be provided).
Your decisions must always align with the long-term goal of optimizing returns while strictly managing risk.

# All Tasks
{{#each tasks}}
- Task: {{this.description}}
  Status: {{this.status}}
  Definition of Done: {{this.definitionOfDone}}
{{/each}}

# Current Task
{{currentTask}}

# Task: Generate dialog and actions for the {{agentName}}
(Explicitly specify action details in response text if they were requested by action description)

{{providers}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for the {{agentName}}.
` + messageCompletionFooter;

export const triggerAdjustmentTemplate = `
Based on the current task and recent conversations, determine what triggers should be active:

Current Task: {{taskDescription}}
Available Trigger Types: polling, dynamic, price

Active Triggers:
{{#each activeTriggers}}
- Type: {{this.type}}
  Parameters: {{this.params}}
{{/each}}

Recent conversations:
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
Evaluate if the following task is complete based on recent conversations and market state:

Task Description: {{description}}
Definition of Done: {{definitionOfDone}}

Recent conversations:
{{recentMessages}}

Respond with a JSON object:
{
  "isComplete": true/false,
  "reason": "explanation"
}
`;

export const triggerEvaluationTemplate = `
Evaluate if the following trigger condition is met based on recent conversations and market state:

Condition: {{condition}}

Recent conversations:
{{recentMessages}}

Respond with a JSON object:
{
  "isTriggered": true/false,
  "reason": "explanation"
}
`;
