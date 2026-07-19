import { describe, it, expect } from 'bun:test';
import { TaskCli } from '../../repositories/task-service/src/cli';
import { TaskStore } from '../../repositories/task-service/src/store';
import { TaskStatus } from '../../repositories/task-service/src/types';
import { validateCreateTask } from '../../repositories/task-service/src/validation';

/**
 * Hidden acceptance tests for refactor-001-extract-validation.
 * Verifies that validation is centralized AND behavior is preserved.
 */
describe('refactor-001-extract-validation — Hidden Acceptance', () => {
  it('existing validators still work', () => {
    const result = validateCreateTask({ title: 'Test', description: 'Desc' });
    expect(result.ok).toBe(true);
  });

  it('CLI update with valid status still works', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    const addOut = cli.run(['add', 'Test', 'Description']);
    const id = addOut.match(/Created task ([^\n]+)/)?.[1]!;

    cli.run(['update', id, '--status', 'done']);
    const task = store.get(id);
    expect(task?.status).toBe(TaskStatus.DONE);
  });

  it('CLI update with invalid status is handled', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    const addOut = cli.run(['add', 'Test', 'Description']);
    const id = addOut.match(/Created task ([^\n]+)/)?.[1]!;

    cli.run(['update', id, '--status', 'bogus_status']);
    const task = store.get(id);
    expect(task?.status).toBe(TaskStatus.TODO); // unchanged
  });

  it('CLI update with valid priority still works', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    const addOut = cli.run(['add', 'Test', 'Description']);
    const id = addOut.match(/Created task ([^\n]+)/)?.[1]!;

    cli.run(['update', id, '--priority', 'critical']);
    const task = store.get(id);
    expect(task?.priority).toBe('critical');
  });

  it('CLI update with invalid priority is handled', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    const addOut = cli.run(['add', 'Test', 'Description']);
    const id = addOut.match(/Created task ([^\n]+)/)?.[1]!;

    cli.run(['update', id, '--priority', 'super-urgent']);
    const task = store.get(id);
    expect(task?.priority).toBe('medium'); // default unchanged
  });

  it('public API unchanged — TaskStore still works directly', () => {
    const store = new TaskStore();
    const result = store.create({ title: 'Test', description: 'Desc' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.value.title).toBe('Test');
  });

  it('public API unchanged — store.delete still works', () => {
    const store = new TaskStore();
    const result = store.create({ title: 'Test', description: 'Desc' });
    if (!result.ok) throw new Error('Expected ok');
    expect(store.delete(result.value.id)).toBe(true);
    expect(store.count).toBe(0);
  });
});
