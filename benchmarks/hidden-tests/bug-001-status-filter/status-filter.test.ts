import { describe, it, expect } from 'bun:test';
import { TaskStore } from '../../repositories/task-service/src/store';
import { TaskStatus, TaskPriority } from '../../repositories/task-service/src/types';

/**
 * Hidden acceptance tests for bug-001-status-filter.
 * These tests run OUTSIDE the writable working tree.
 * The agent cannot see or modify them.
 */
describe('bug-001-status-filter — Hidden Acceptance', () => {
  it('filters tasks by todo status correctly', () => {
    const store = new TaskStore();
    store.create({ title: 'Keep', description: 'Should appear' });
    store.create({ title: 'Done task', description: 'Should not appear' });

    // Mark second task as done
    const tasks = store.list();
    const doneTask = tasks.find((t) => t.title === 'Done task');
    store.update(doneTask!.id, { status: TaskStatus.DONE });

    const filtered = store.list({ status: TaskStatus.TODO });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.title).toBe('Keep');
  });

  it('filters tasks by done status correctly', () => {
    const store = new TaskStore();
    store.create({ title: 'Todo task', description: 'Should not appear' });

    const tasks = store.list();
    const todoTask = tasks.find((t) => t.title === 'Todo task');
    store.update(todoTask!.id, { status: TaskStatus.DONE });

    const filtered = store.list({ status: TaskStatus.DONE });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.title).toBe('Todo task');
  });

  it('returns empty array when no tasks match status', () => {
    const store = new TaskStore();
    store.create({ title: 'Only todo', description: 'Test' });

    const filtered = store.list({ status: TaskStatus.IN_PROGRESS });
    expect(filtered.length).toBe(0);
  });

  it('combines status filter with priority filter', () => {
    const store = new TaskStore();
    store.create({ title: 'High todo', description: 'A', priority: TaskPriority.HIGH });
    store.create({ title: 'Low todo', description: 'B', priority: TaskPriority.LOW });

    // Mark low todo as in_progress
    const tasks = store.list();
    const lowTask = tasks.find((t) => t.title === 'Low todo');
    store.update(lowTask!.id, { status: TaskStatus.IN_PROGRESS });

    const filtered = store.list({
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
    });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.title).toBe('High todo');
  });

  it('filters by in_progress status', () => {
    const store = new TaskStore();
    store.create({ title: 'In flight', description: 'Working on it' });
    const tasks = store.list();
    const task = tasks.find((t) => t.title === 'In flight');
    store.update(task!.id, { status: TaskStatus.IN_PROGRESS });

    const filtered = store.list({ status: TaskStatus.IN_PROGRESS });
    expect(filtered.length).toBe(1);
  });

  it('filters by cancelled status', () => {
    const store = new TaskStore();
    store.create({ title: 'Cancelled task', description: 'Not needed' });
    const tasks = store.list();
    const task = tasks.find((t) => t.title === 'Cancelled task');
    store.update(task!.id, { status: TaskStatus.CANCELLED });

    const filtered = store.list({ status: TaskStatus.CANCELLED });
    expect(filtered.length).toBe(1);
  });
});
