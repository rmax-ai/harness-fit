/**
 * Core types for the task-service benchmark.
 *
 * This is a deliberately realistic microservice — an LLM agent tasked with
 * modifying it must understand the type system, validation, and CLI interface.
 */

export type TaskId = string & { readonly __brand: unique symbol };

export const TaskStatus = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export interface Task {
  readonly id: TaskId;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  readonly createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority?: TaskPriority;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
}

export interface TaskFilter {
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
}

export function createTaskId(): TaskId {
  return crypto.randomUUID() as TaskId;
}

export function createTask(input: CreateTaskInput): Task {
  const now = new Date().toISOString();
  return {
    id: createTaskId(),
    title: input.title,
    description: input.description,
    status: TaskStatus.TODO,
    priority: input.priority ?? TaskPriority.MEDIUM,
    createdAt: now,
    updatedAt: now,
  };
}
