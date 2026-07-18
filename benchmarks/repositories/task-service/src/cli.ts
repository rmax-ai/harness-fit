import type { TaskFilter, TaskPriority, TaskStatus } from './types';
import { TaskPriority as TP, TaskStatus as TS } from './types';
import { TaskStore } from './store';

/**
 * CLI command handler for the task-service.
 *
 * Parses command-line arguments and delegates to TaskStore.
 * The CLI is deliberately simple — no commander/yargs, just Bun.argv parsing.
 */

export class TaskCli {
  constructor(private readonly store: TaskStore) {}

  run(args: string[]): string {
    if (args.length === 0) {
      return this.help();
    }

    const command = args[0]!;
    const cmdArgs = args.slice(1);

    switch (command) {
      case 'add':
        return this.handleAdd(cmdArgs);
      case 'list':
        return this.handleList(cmdArgs);
      case 'get':
        return this.handleGet(cmdArgs);
      case 'update':
        return this.handleUpdate(cmdArgs);
      case 'delete':
        return this.handleDelete(cmdArgs);
      case 'stats':
        return this.handleStats();
      case 'help':
        return this.help();
      default:
        return `Unknown command: ${command}\n${this.help()}`;
    }
  }

  private handleAdd(args: string[]): string {
    if (args.length < 2) {
      return 'Usage: add <title> <description> [--priority low|medium|high|critical]';
    }

    const title = args[0]!;
    const description = args[1]!;
    let priority: TaskPriority | undefined;

    const priorityIdx = args.indexOf('--priority');
    if (priorityIdx !== -1 && args[priorityIdx + 1]) {
      const val = args[priorityIdx + 1];
      if (Object.values(TP).includes(val as TaskPriority)) {
        priority = val as TaskPriority;
      }
    }

    const result = this.store.create({ title, description, priority });
    if (!result.ok) {
      return `Error: ${result.errors.map((e) => `${e.field}: ${e.message}`).join('\n')}`;
    }

    const task = result.value;
    return `Created task ${task.id}\n  Title: ${task.title}\n  Status: ${task.status}\n  Priority: ${task.priority}`;
  }

  private handleList(args: string[]): string {
    const filter: TaskFilter = {};

    const statusIdx = args.indexOf('--status');
    if (statusIdx !== -1 && args[statusIdx + 1]) {
      filter.status = args[statusIdx + 1] as TaskStatus;
    }

    const priorityIdx = args.indexOf('--priority');
    if (priorityIdx !== -1 && args[priorityIdx + 1]) {
      filter.priority = args[priorityIdx + 1] as TaskPriority;
    }

    const searchIdx = args.indexOf('--search');
    if (searchIdx !== -1 && args[searchIdx + 1]) {
      filter.search = args[searchIdx + 1];
    }

    const tasks = this.store.list(
      Object.keys(filter).length > 0 ? filter : undefined,
    );

    if (tasks.length === 0) {
      return 'No tasks found.';
    }

    const lines = [`${tasks.length} task(s):`];
    for (const task of tasks) {
      lines.push(
        `  [${task.id.slice(0, 8)}] ${task.title} — ${task.status} (${task.priority})`,
      );
    }
    return lines.join('\n');
  }

  private handleGet(args: string[]): string {
    if (args.length === 0) {
      return 'Usage: get <id>';
    }

    const task = this.store.get(args[0]!);
    if (!task) {
      return `Task not found: ${args[0]}`;
    }

    return [
      `ID: ${task.id}`,
      `Title: ${task.title}`,
      `Description: ${task.description}`,
      `Status: ${task.status}`,
      `Priority: ${task.priority}`,
      `Created: ${task.createdAt}`,
      `Updated: ${task.updatedAt}`,
    ].join('\n');
  }

  private handleUpdate(args: string[]): string {
    if (args.length < 2) {
      return 'Usage: update <id> [--title <text>] [--description <text>] [--status todo|in_progress|done|cancelled] [--priority low|medium|high|critical]';
    }

    const id = args[0]!;
    const updates: Record<string, string> = {};

    for (let i = 1; i < args.length; i++) {
      if (args[i]?.startsWith('--') && args[i + 1]) {
        updates[args[i]!.slice(2)] = args[i + 1]!;
        i++; // skip value
      }
    }

    const task = this.store.update(id, {
      title: updates.title,
      description: updates.description,
      status: updates.status as TaskStatus | undefined,
      priority: updates.priority as TaskPriority | undefined,
    });

    if (!task) {
      return `Task not found: ${id}`;
    }

    return `Updated task ${task.id}\n  Title: ${task.title}\n  Status: ${task.status}\n  Priority: ${task.priority}`;
  }

  private handleDelete(args: string[]): string {
    if (args.length === 0) {
      return 'Usage: delete <id>';
    }

    const deleted = this.store.delete(args[0]!);
    return deleted ? `Deleted task ${args[0]}` : `Task not found: ${args[0]}`;
  }

  private handleStats(): string {
    const byStatus = this.store.countsByStatus();
    const byPriority = this.store.countsByPriority();

    return [
      `Total tasks: ${this.store.count}`,
      '',
      'By status:',
      ...Object.entries(byStatus).map(([s, c]) => `  ${s}: ${c}`),
      '',
      'By priority:',
      ...Object.entries(byPriority).map(([p, c]) => `  ${p}: ${c}`),
    ].join('\n');
  }

  private help(): string {
    return [
      'Task Service CLI',
      '',
      'Commands:',
      '  add <title> <desc> [--priority <p>]   Create a new task',
      '  list [--status <s>] [--priority <p>] [--search <term>]  List tasks',
      '  get <id>                              Get task details',
      '  update <id> [--title <t>] [--desc <d>] [--status <s>] [--priority <p>]',
      '  delete <id>                           Delete a task',
      '  stats                                 Show task statistics',
      '  help                                  Show this help',
      '',
      'Statuses: todo, in_progress, done, cancelled',
      'Priorities: low, medium, high, critical',
    ].join('\n');
  }
}

// CLI entry point when run directly
if (import.meta.main) {
  const store = new TaskStore();
  const cli = new TaskCli(store);
  const args = Bun.argv.slice(2);
  const output = cli.run(args);
  console.log(output);
}
