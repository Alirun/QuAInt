import { Note, Task, Trigger } from '../core/types';

export const formatNote = (note: Note): string => {
  const { key, value, metadata } = note;
  return [
    `- Key: ${key}`,
    `  Value: ${value}`,
    `  Category: ${metadata?.category || 'N/A'}`,
    `  Priority: ${metadata?.priority || 'N/A'}`
  ].join('\n');
};

export const formatTask = (task: Task): string => {
  const { description, status, definitionOfDone, triggerTypes, data } = task;
  const triggerLines = triggerTypes.map(type => {
    const usage = data?.triggerUsage?.[type];
    return usage ? `    ${type}: ${usage}` : type;
  });
  
  return [
    `- Description: ${description}`,
    `  Status: ${status}`,
    `  Required Triggers:`,
    ...triggerLines,
    `  Definition of Done: ${definitionOfDone}`
  ].join('\n');
};

export const formatTrigger = (trigger: Trigger): string => {
  const { type, params } = trigger;
  return [
    `- Type: ${type}`,
    `  Parameters: ${JSON.stringify(params, null, 2)}`
  ].join('\n');
};

export const formatters = {
  notes: (notes: Note[]): string => notes.map(formatNote).join('\n'),
  tasks: (tasks: Task[]): string => tasks.map(formatTask).join('\n'),
  triggers: (triggers: Trigger[]): string => 
    triggers
      .filter(t => t.type === 'price')
      .map(formatTrigger)
      .join('\n')
};
