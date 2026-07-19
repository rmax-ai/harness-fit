import { describe, it, expect } from 'bun:test';
import { TaskCli } from '../../repositories/task-service/src/cli';
import { TaskStore } from '../../repositories/task-service/src/store';

describe('feat-002-json-output — Hidden Acceptance', () => {
  it('list --json returns valid JSON array', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    cli.run(['add', 'Task A', 'Description A']);
    cli.run(['add', 'Task B', 'Description B']);

    const out = cli.run(['list', '--json']);
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0].title).toBe('Task A');
    expect(parsed[1].title).toBe('Task B');
    expect(parsed[0].id).toBeDefined();
    expect(parsed[0].status).toBe('todo');
    expect(parsed[0].priority).toBe('medium');
  });

  it('get --json returns valid JSON object', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    const addOut = cli.run(['add', 'Specific task', 'With details']);
    const id = addOut.match(/Created task ([^\n]+)/)?.[1]!;

    const out = cli.run(['get', id, '--json']);
    const parsed = JSON.parse(out);
    expect(parsed.id).toBe(id);
    expect(parsed.title).toBe('Specific task');
    expect(parsed.description).toBe('With details');
    expect(parsed.status).toBe('todo');
  });

  it('stats --json returns valid JSON with keys', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    cli.run(['add', 'Task', 'Desc']);
    cli.run(['add', 'Task 2', 'Desc 2', '--priority', 'high']);

    const out = cli.run(['stats', '--json']);
    const parsed = JSON.parse(out);
    expect(parsed.total).toBe(2);
    expect(parsed.byStatus).toBeDefined();
    expect(parsed.byPriority).toBeDefined();
    expect(parsed.byPriority.high).toBe(1);
  });

  it('text output unchanged without --json', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    cli.run(['add', 'Task', 'Desc']);

    const out = cli.run(['list']);
    // Should NOT be valid JSON
    expect(() => JSON.parse(out)).toThrow();
    expect(out).toContain('1 task(s)');
    expect(out).toContain('Task');
  });

  it('list --json with filters still works', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);
    cli.run(['add', 'High task', 'A', '--priority', 'high']);
    cli.run(['add', 'Low task', 'B', '--priority', 'low']);

    const out = cli.run(['list', '--priority', 'high', '--json']);
    const parsed = JSON.parse(out);
    expect(parsed.length).toBe(1);
    expect(parsed[0].title).toBe('High task');
  });

  it('list --json with no tasks returns empty array', () => {
    const store = new TaskStore();
    const cli = new TaskCli(store);

    const out = cli.run(['list', '--json']);
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(0);
  });
});
