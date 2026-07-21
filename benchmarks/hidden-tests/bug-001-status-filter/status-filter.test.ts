import { describe, expect, it } from 'bun:test';
import { TaskCli } from '../../repositories/task-service/src/cli';
import { TaskStore } from '../../repositories/task-service/src/store';
import { TaskPriority, TaskStatus } from '../../repositories/task-service/src/types';

/**
 * Hidden acceptance tests for bug-001-status-filter.
 * These tests run OUTSIDE the writable working tree.
 * The agent cannot see or modify them.
 */
describe('bug-001-status-filter — Hidden Acceptance', () => {
  it('filters tasks by todo status correctly', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    store.create({ title: 'Keep', description: 'Should appear' });
    store.create({ title: 'Done task', description: 'Should not appear' });

    // Mark second task as done
    const tasks = store.list();
    const doneTask = tasks.find((t) => t.title === 'Done task');
    store.update(requireTaskId(doneTask), { status: TaskStatus.DONE });

    const output = cli.run(['list', '--status', TaskStatus.TODO]);
    expect(output).toContain('1 task(s):');
    expect(output).toContain('Keep');
    expect(output).not.toContain('Done task');
  });

  it('filters tasks by done status correctly', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    store.create({ title: 'Todo task', description: 'Should not appear' });

    const tasks = store.list();
    const todoTask = tasks.find((t) => t.title === 'Todo task');
    store.update(requireTaskId(todoTask), { status: TaskStatus.DONE });

    const output = cli.run(['list', '--status', TaskStatus.DONE]);
    expect(output).toContain('1 task(s):');
    expect(output).toContain('Todo task');
  });

  it('returns empty array when no tasks match status', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    store.create({ title: 'Only todo', description: 'Test' });

    const output = cli.run(['list', '--status', TaskStatus.IN_PROGRESS]);
    expect(output).toBe('No tasks found.');
  });

  it('combines status filter with priority filter', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    store.create({ title: 'High todo', description: 'A', priority: TaskPriority.HIGH });
    store.create({ title: 'Low todo', description: 'B', priority: TaskPriority.LOW });

    // Mark low todo as in_progress
    const tasks = store.list();
    const lowTask = tasks.find((t) => t.title === 'Low todo');
    store.update(requireTaskId(lowTask), { status: TaskStatus.IN_PROGRESS });

    const output = cli.run(['list', '--status', TaskStatus.TODO, '--priority', TaskPriority.HIGH]);
    expect(output).toContain('1 task(s):');
    expect(output).toContain('High todo');
  });

  it('filters by in_progress status', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    store.create({ title: 'In flight', description: 'Working on it' });
    const tasks = store.list();
    const task = tasks.find((t) => t.title === 'In flight');
    store.update(requireTaskId(task), { status: TaskStatus.IN_PROGRESS });

    const output = cli.run(['list', '--status', TaskStatus.IN_PROGRESS]);
    expect(output).toContain('In flight');
  });

  it('filters by cancelled status', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    store.create({ title: 'Cancelled task', description: 'Not needed' });
    const tasks = store.list();
    const task = tasks.find((t) => t.title === 'Cancelled task');
    store.update(requireTaskId(task), { status: TaskStatus.CANCELLED });

    const output = cli.run(['list', '--status', TaskStatus.CANCELLED]);
    expect(output).toContain('Cancelled task');
  });
});

function requireTaskId(task: { readonly id: string } | undefined): string {
  if (!task) throw new Error('Expected task to exist');
  return task.id;
}
