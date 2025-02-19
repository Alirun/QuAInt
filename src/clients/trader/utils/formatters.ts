import { Note, Task, Trigger } from '../core/types';

/**
 * Format a note for display in templates
 */
export const formatNote = (note: Note): string => {
  const { key, value, metadata } = note;
  const formattedValue = typeof value === 'object' 
    ? JSON.stringify(value, null, 2)
    : value;
  
  return [
    `- Key: ${key}`,
    `  Value: ${formattedValue}`,
    `  Category: ${metadata?.category || 'N/A'}`,
    `  Priority: ${metadata?.priority || 'N/A'}`
  ].join('\n');
};

/**
 * Format a task for display in templates
 */
export const formatTask = (task: Task): string => {
  const { description, status, definitionOfDone, triggerTypes, data } = task;
  const triggerLines = triggerTypes.map(type => {
    const usage = data?.triggerUsage?.[type];
    return usage ? `    ${type}: ${usage}` : `    ${type}`;
  });
  
  return [
    `- Description: ${description}`,
    `  Status: ${status}`,
    `  Required Triggers:`,
    ...triggerLines,
    `  Definition of Done: ${definitionOfDone}`
  ].join('\n');
};

/**
 * Format a trigger for display in templates
 */
export const formatTrigger = (trigger: Trigger): string => {
  const { type, params } = trigger;
  return [
    `- Type: ${type}`,
    `  Parameters: ${JSON.stringify(params, null, 2)}`
  ].join('\n');
};

/**
 * Collection of formatters for converting arrays of domain objects to template strings
 */
export const formatters = {
  notes: (notes: Note[]): string => notes.map(formatNote).join('\n'),
  tasks: (tasks: Task[]): string => tasks.map(formatTask).join('\n'),
  triggers: (triggers: Trigger[]): string => triggers.map(formatTrigger).join('\n')
};
