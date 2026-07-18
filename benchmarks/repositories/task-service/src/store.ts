import type { Task, CreateTaskInput, UpdateTaskInput, TaskFilter } from './types';
import { TaskStatus, createTask } from './types';
import { validateCreateTask, validateTaskId } from './validation';
import type { ValidationResult } from './validation';

/**
 * In-memory task store with optional JSON file persistence.
 *
 * All mutations return the updated task. Reads return readonly copies.
 * The store is deliberately synchronous — no async complexity needed for the benchmark.
 */

export class TaskStore {
  private tasks: Map<string, Task> = new Map();

  constructor(initialTasks?: readonly Task[]) {
    if (initialTasks) {
      for (const task of initialTasks) {
        this.tasks.set(task.id, task);
      }
    }
  }

  /** Create a new task. Returns the created task or validation errors. */
  create(input: CreateTaskInput): ValidationResult<Task> {
    const validation = validateCreateTask(input);
    if (!validation.ok) return validation;

    const task = createTask(validation.value);
    this.tasks.set(task.id, task);
    return { ok: true, value: { ...task } };
  }

  /** Get a task by ID. Returns undefined if not found. */
  get(id: string): Task | undefined {
    const task = this.tasks.get(id);
    return task ? { ...task } : undefined;
  }

  /** List all tasks, optionally filtered. */
  list(filter?: TaskFilter): readonly Task[] {
    let result = [...this.tasks.values()];

    if (filter) {
      if (filter.status) {
        result = result.filter((t) => t.status === filter.status);
      }
      if (filter.priority) {
        result = result.filter((t) => t.priority === filter.priority);
      }
      if (filter.search) {
        const term = filter.search.toLowerCase();
        result = result.filter(
          (t) =>
            t.title.toLowerCase().includes(term) ||
            t.description.toLowerCase().includes(term),
        );
      }
    }

    return result.map((t) => ({ ...t }));
  }

  /** Update a task by ID. Returns the updated task or undefined if not found. */
  update(id: string, input: UpdateTaskInput): Task | undefined {
    const existing = this.tasks.get(id);
    if (!existing) return undefined;

    const updated: Task = {
      ...existing,
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      status: input.status ?? existing.status,
      priority: input.priority ?? existing.priority,
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(id, updated);
    return { ...updated };
  }

  /** Delete a task by ID. Returns true if deleted, false if not found. */
  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  /** Get the total count of tasks. */
  get count(): number {
    return this.tasks.size;
  }

  /** Get counts grouped by status. */
  countsByStatus(): Record<Task['status'], number> {
    const counts: Record<string, number> = {};
    for (const task of this.tasks.values()) {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
    }
    return counts as Record<Task['status'], number>;
  }

  /** Get counts grouped by priority. */
  countsByPriority(): Record<Task['priority'], number> {
    const counts: Record<string, number> = {};
    for (const task of this.tasks.values()) {
      counts[task.priority] = (counts[task.priority] ?? 0) + 1;
    }
    return counts as Record<Task['priority'], number>;
  }

  /** Export all tasks as a plain array (for serialization). */
  export(): readonly Task[] {
    return [...this.tasks.values()].map((t) => ({ ...t }));
  }

  /** Import tasks from a plain array, replacing all existing tasks. */
  import(tasks: readonly Task[]): void {
    this.tasks.clear();
    for (const task of tasks) {
      this.tasks.set(task.id, { ...task });
    }
  }
}
