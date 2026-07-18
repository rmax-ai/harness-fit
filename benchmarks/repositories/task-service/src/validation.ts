import type { CreateTaskInput } from './types';
import { TaskPriority } from './types';

/**
 * Validation functions for task inputs.
 *
 * IMPORTANT: These validators enforce business rules. Changing them without
 * updating tests will cause regressions.
 */

export interface ValidationError {
  field: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: readonly ValidationError[] };

export function validateCreateTask(input: unknown): ValidationResult<CreateTaskInput> {
  const errors: ValidationError[] = [];

  if (!input || typeof input !== 'object') {
    return { ok: false, errors: [{ field: 'input', message: 'Input must be an object' }] };
  }

  const data = input as Record<string, unknown>;

  if (!data.title || typeof data.title !== 'string') {
    errors.push({ field: 'title', message: 'Title is required and must be a string' });
  } else if (data.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title must not be empty' });
  } else if (data.title.length > 200) {
    errors.push({ field: 'title', message: 'Title must not exceed 200 characters' });
  }

  if (!data.description || typeof data.description !== 'string') {
    errors.push({ field: 'description', message: 'Description is required and must be a string' });
  } else if (data.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description must not be empty' });
  } else if (data.description.length > 5000) {
    errors.push({ field: 'description', message: 'Description must not exceed 5000 characters' });
  }

  if (data.priority !== undefined) {
    const validPriorities = Object.values(TaskPriority);
    if (typeof data.priority !== 'string' || !(validPriorities as string[]).includes(data.priority)) {
      errors.push({
        field: 'priority',
        message: `Priority must be one of: ${validPriorities.join(', ')}`,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      title: (data.title as string).trim(),
      description: (data.description as string).trim(),
      priority: data.priority as CreateTaskInput['priority'],
    },
  };
}

export function validateTaskId(id: unknown): ValidationResult<string> {
  if (typeof id !== 'string' || id.trim().length === 0) {
    return { ok: false, errors: [{ field: 'id', message: 'Task ID must be a non-empty string' }] };
  }
  return { ok: true, value: id };
}

export function validateTaskFilter(filter: unknown): ValidationResult<Record<string, unknown>> {
  if (!filter || typeof filter !== 'object') {
    return { ok: false, errors: [{ field: 'filter', message: 'Filter must be an object' }] };
  }
  return { ok: true, value: filter as Record<string, unknown> };
}
