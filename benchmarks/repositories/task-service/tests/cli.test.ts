import { describe, it, expect, beforeEach } from 'bun:test';
import { TaskCli } from '../src/cli';
import { TaskStore } from '../src/store';

describe('TaskCli', () => {
  let store: TaskStore;
  let cli: TaskCli;

  beforeEach(() => {
    store = new TaskStore();
    cli = new TaskCli(store);
  });

  describe('add', () => {
    it('adds a task and returns its details', () => {
      const output = cli.run(['add', 'Fix bug', 'Something broken']);
      expect(output).toContain('Created task');
      expect(output).toContain('Fix bug');
      expect(output).toContain('todo');
    });

    it('accepts priority flag', () => {
      const output = cli.run(['add', 'Fix', 'Desc', '--priority', 'high']);
      expect(output).toContain('high');
    });
  });

  describe('list', () => {
    it('lists tasks', () => {
      cli.run(['add', 'Task A', 'Desc A']);
      cli.run(['add', 'Task B', 'Desc B']);
      const output = cli.run(['list']);
      expect(output).toContain('2 task(s)');
      expect(output).toContain('Task A');
      expect(output).toContain('Task B');
    });

    it('shows empty message when no tasks', () => {
      const output = cli.run(['list']);
      expect(output).toContain('No tasks found');
    });

    it('filters by status', () => {
      cli.run(['add', 'Task A', 'Desc']);
      const output = cli.run(['list', '--status', 'done']);
      expect(output).toContain('No tasks found');
    });
  });

  describe('get', () => {
    it('shows task details', () => {
      const addOutput = cli.run(['add', 'Test', 'Description']);
      const id = addOutput.match(/Created task ([^\n]+)/)?.[1];
      expect(id).toBeDefined();

      const output = cli.run(['get', id!]);
      expect(output).toContain('Test');
      expect(output).toContain('Description');
    });

    it('shows not found for missing task', () => {
      const output = cli.run(['get', 'nonexistent']);
      expect(output).toContain('Task not found');
    });
  });

  describe('update', () => {
    it('updates a task', () => {
      const addOutput = cli.run(['add', 'Old', 'Old desc']);
      const id = addOutput.match(/Created task ([^\n]+)/)?.[1]!;

      const output = cli.run(['update', id, '--title', 'New title', '--status', 'in_progress']);
      expect(output).toContain('New title');
      expect(output).toContain('in_progress');
    });
  });

  describe('delete', () => {
    it('deletes a task', () => {
      const addOutput = cli.run(['add', 'Temp', 'To delete']);
      const id = addOutput.match(/Created task ([^\n]+)/)?.[1]!;

      const output = cli.run(['delete', id]);
      expect(output).toContain('Deleted task');

      const listOutput = cli.run(['list']);
      expect(listOutput).toContain('No tasks found');
    });
  });

  describe('stats', () => {
    it('shows statistics', () => {
      cli.run(['add', 'A', 'a', '--priority', 'high']);
      cli.run(['add', 'B', 'b', '--priority', 'low']);
      const output = cli.run(['stats']);
      expect(output).toContain('Total tasks: 2');
      expect(output).toContain('todo: 2');
      expect(output).toContain('high: 1');
      expect(output).toContain('low: 1');
    });
  });

  describe('help', () => {
    it('shows help for no command', () => {
      const output = cli.run([]);
      expect(output).toContain('Task Service CLI');
    });

    it('shows help for unknown command', () => {
      const output = cli.run(['unknown']);
      expect(output).toContain('Unknown command');
    });
  });
});
