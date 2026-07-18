import { describe, it, expect } from 'bun:test';
import { TaskCli } from '../../src/cli';
import { TaskStore } from '../../src/store';
import { TaskPriority } from '../../src/types';

describe('feat-001-priority-filter — Hidden Acceptance', () => {
  it('filters by priority alone', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    cli.run(['add', 'High task', 'A', '--priority', 'high']);
    cli.run(['add', 'Low task', 'B', '--priority', 'low']);

    const out = cli.run(['list', '--priority', 'high']);
    expect(out).toContain('1 task');
    expect(out).toContain('High task');
    expect(out).not.toContain('Low task');
  });

  it('filters by low priority', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    cli.run(['add', 'High task', 'A', '--priority', 'high']);
    cli.run(['add', 'Low task', 'B', '--priority', 'low']);

    const out = cli.run(['list', '--priority', 'low']);
    expect(out).toContain('Low task');
    expect(out).not.toContain('High task');
  });

  it('combines status and priority filters', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    cli.run(['add', 'High todo', 'A', '--priority', 'high']);
    cli.run(['add', 'Low done', 'B', '--priority', 'low']);

    // Mark the low task as done
    const tasks = store.list();
    const lowTask = tasks.find((t) => t.title === 'Low done');
    store.update(lowTask!.id, { status: 'done' as never });

    const out = cli.run(['list', '--status', 'done', '--priority', 'low']);
    expect(out).toContain('Low done');
    expect(out).not.toContain('High todo');
  });

  it('shows empty result for non-matching priority', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    cli.run(['add', 'Task', 'Desc', '--priority', 'medium']);

    const out = cli.run(['list', '--priority', 'critical']);
    expect(out).toContain('No tasks found');
  });

  it('works with medium priority', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    cli.run(['add', 'Med task', 'Desc', '--priority', 'medium']);

    const out = cli.run(['list', '--priority', 'medium']);
    expect(out).toContain('Med task');
  });
});
