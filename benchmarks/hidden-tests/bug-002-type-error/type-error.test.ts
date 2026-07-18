import { describe, it, expect } from 'bun:test';
import { TaskCli } from '../../src/cli';
import { TaskStore } from '../../src/store';
import { TaskStatus } from '../../src/types';

/**
 * Hidden acceptance tests for bug-002-type-error.
 * The agent must fix the type error without breaking functionality.
 */
describe('bug-002-type-error — Hidden Acceptance', () => {
  it('can update task status to in_progress', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    const addOut = cli.run(['add', 'Test', 'Description']);
    const id = addOut.match(/Created task ([^\n]+)/)?.[1]!;

    cli.run(['update', id, '--status', 'in_progress']);
    const task = store.get(id);
    expect(task?.status).toBe(TaskStatus.IN_PROGRESS);
  });

  it('can update task status to done', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    const addOut = cli.run(['add', 'Test', 'Description']);
    const id = addOut.match(/Created task ([^\n]+)/)?.[1]!;

    cli.run(['update', id, '--status', 'done']);
    const task = store.get(id);
    expect(task?.status).toBe(TaskStatus.DONE);
  });

  it('can update task status to cancelled', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    const addOut = cli.run(['add', 'Test', 'Description']);
    const id = addOut.match(/Created task ([^\n]+)/)?.[1]!;

    cli.run(['update', id, '--status', 'cancelled']);
    const task = store.get(id);
    expect(task?.status).toBe(TaskStatus.CANCELLED);
  });

  it('rejects invalid status value gracefully', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    const addOut = cli.run(['add', 'Test', 'Description']);
    const id = addOut.match(/Created task ([^\n]+)/)?.[1]!;

    // Should not crash — should show error or ignore invalid status
    cli.run(['update', id, '--status', 'invalid_status']);
    const task = store.get(id);
    // Task should still exist and be in default status
    expect(task).toBeDefined();
    expect(task?.status).toBe(TaskStatus.TODO);
  });

  it('can update priority to critical', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    const addOut = cli.run(['add', 'Test', 'Description']);
    const id = addOut.match(/Created task ([^\n]+)/)?.[1]!;

    cli.run(['update', id, '--priority', 'critical']);
    const task = store.get(id);
    expect(task?.priority).toBe('critical');
  });

  it('update with title and description still works', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    const addOut = cli.run(['add', 'Old', 'Old description']);
    const id = addOut.match(/Created task ([^\n]+)/)?.[1]!;

    cli.run(['update', id, '--title', 'New title', '--description', 'New description']);
    const task = store.get(id);
    expect(task?.title).toBe('New title');
    expect(task?.description).toBe('New description');
  });
});
