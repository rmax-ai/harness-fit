import { describe, it, expect } from 'bun:test';
import {
  validateCreateTask,
  validateTaskId,
} from '../src/validation';
import { TaskPriority } from '../src/types';

describe('validateCreateTask', () => {
  it('validates a correct input', () => {
    const result = validateCreateTask({
      title: 'Fix bug',
      description: 'Something is broken',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.value.title).toBe('Fix bug');
    expect(result.value.description).toBe('Something is broken');
    expect(result.value.priority).toBeUndefined();
  });

  it('validates input with priority', () => {
    const result = validateCreateTask({
      title: 'Fix bug',
      description: 'Something is broken',
      priority: TaskPriority.HIGH,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.value.priority).toBe(TaskPriority.HIGH);
  });

  it('rejects null input', () => {
    const result = validateCreateTask(null);
    expect(result.ok).toBe(false);
  });

  it('rejects missing title', () => {
    const result = validateCreateTask({ description: 'desc' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error');
    expect(result.errors.some((e) => e.field === 'title')).toBe(true);
  });

  it('rejects whitespace-only title', () => {
    const result = validateCreateTask({ title: '   ', description: 'desc' });
    expect(result.ok).toBe(false);
  });

  it('rejects title over 200 characters', () => {
    const result = validateCreateTask({
      title: 'x'.repeat(201),
      description: 'desc',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects missing description', () => {
    const result = validateCreateTask({ title: 'title' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error');
    expect(result.errors.some((e) => e.field === 'description')).toBe(true);
  });

  it('rejects description over 5000 characters', () => {
    const result = validateCreateTask({
      title: 'title',
      description: 'x'.repeat(5001),
    });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid priority', () => {
    const result = validateCreateTask({
      title: 'test',
      description: 'desc',
      priority: 'super-urgent',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error');
    const priorityError = result.errors.find((e) => e.field === 'priority');
    expect(priorityError).toBeDefined();
    expect(priorityError!.message).toContain('low, medium, high, critical');
  });

  it('trims whitespace from title and description', () => {
    const result = validateCreateTask({
      title: '  hello  ',
      description: '  world  ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.value.title).toBe('hello');
    expect(result.value.description).toBe('world');
  });
});

describe('validateTaskId', () => {
  it('accepts a valid ID', () => {
    const result = validateTaskId('abc-123');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.value).toBe('abc-123');
  });

  it('rejects empty string', () => {
    const result = validateTaskId('');
    expect(result.ok).toBe(false);
  });

  it('rejects non-string input', () => {
    const result = validateTaskId(123);
    expect(result.ok).toBe(false);
  });
});
