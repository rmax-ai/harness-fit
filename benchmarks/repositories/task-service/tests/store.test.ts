import { describe, it, expect, beforeEach } from 'bun:test';
import { TaskStore } from '../src/store';
import { TaskStatus, TaskPriority } from '../src/types';
import type { Task } from '../src/types';

describe('TaskStore', () => {
  let store: TaskStore;

  beforeEach(() => {
    store = new TaskStore();
  });

  describe('create', () => {
    it('creates a task with valid input', () => {
      const result = store.create({
        title: 'Fix login bug',
        description: 'Users cannot log in with SSO',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');

      expect(result.value.title).toBe('Fix login bug');
      expect(result.value.description).toBe('Users cannot log in with SSO');
      expect(result.value.status).toBe(TaskStatus.TODO);
      expect(result.value.priority).toBe(TaskPriority.MEDIUM); // default
      expect(result.value.id).toBeDefined();
      expect(result.value.createdAt).toBeDefined();
      expect(result.value.updatedAt).toBeDefined();
    });

    it('creates a task with explicit priority', () => {
      const result = store.create({
        title: 'Critical fix',
        description: 'Production is down',
        priority: TaskPriority.CRITICAL,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.priority).toBe(TaskPriority.CRITICAL);
    });

    it('rejects empty title', () => {
      const result = store.create({ title: '', description: 'desc' });
      expect(result.ok).toBe(false);
    });

    it('rejects empty description', () => {
      const result = store.create({ title: 'title', description: '' });
      expect(result.ok).toBe(false);
    });

    it('rejects title over 200 chars', () => {
      const result = store.create({
        title: 'x'.repeat(201),
        description: 'desc',
      });
      expect(result.ok).toBe(false);
    });

    it('rejects invalid priority', () => {
      const result = store.create({
        title: 'test',
        description: 'desc',
        priority: 'super-urgent' as TaskPriority,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('get', () => {
    it('returns undefined for non-existent task', () => {
      expect(store.get('nonexistent')).toBeUndefined();
    });

    it('returns a task by ID', () => {
      const result = store.create({ title: 'Test', description: 'Desc' });
      if (!result.ok) throw new Error('Expected ok');
      const found = store.get(result.value.id);
      expect(found).toBeDefined();
      expect(found!.title).toBe('Test');
    });

    it('returns a copy, not the internal reference', () => {
      const result = store.create({ title: 'Test', description: 'Desc' });
      if (!result.ok) throw new Error('Expected ok');
      const found = store.get(result.value.id);
      found!.title = 'Modified';
      const refetched = store.get(result.value.id);
      expect(refetched!.title).toBe('Test');
    });
  });

  describe('list', () => {
    beforeEach(() => {
      store.create({ title: 'Task A', description: 'First', priority: TaskPriority.HIGH });
      store.create({ title: 'Task B', description: 'Second', priority: TaskPriority.LOW });
      store.create({ title: 'Task C', description: 'Third' });
    });

    it('lists all tasks', () => {
      const tasks = store.list();
      expect(tasks.length).toBe(3);
    });

    it('filters by status', () => {
      // All created as TODO by default
      const tasks = store.list({ status: TaskStatus.TODO });
      expect(tasks.length).toBe(3);

      const done = store.list({ status: TaskStatus.DONE });
      expect(done.length).toBe(0);
    });

    it('filters by priority', () => {
      const high = store.list({ priority: TaskPriority.HIGH });
      expect(high.length).toBe(1);
      expect(high[0]!.title).toBe('Task A');
    });

    it('filters by search term', () => {
      const results = store.list({ search: 'First' });
      expect(results.length).toBe(1);
      expect(results[0]!.title).toBe('Task A');
    });

    it('combines filters', () => {
      const results = store.list({
        status: TaskStatus.TODO,
        priority: TaskPriority.LOW,
      });
      expect(results.length).toBe(1);
      expect(results[0]!.title).toBe('Task B');
    });
  });

  describe('update', () => {
    it('updates task fields', () => {
      const result = store.create({ title: 'Old', description: 'Old desc' });
      if (!result.ok) throw new Error('Expected ok');

      const updated = store.update(result.value.id, {
        title: 'New',
        status: TaskStatus.IN_PROGRESS,
      });

      expect(updated).toBeDefined();
      expect(updated!.title).toBe('New');
      expect(updated!.description).toBe('Old desc'); // unchanged
      expect(updated!.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('returns undefined for non-existent task', () => {
      expect(store.update('nonexistent', { title: 'New' })).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes an existing task', () => {
      const result = store.create({ title: 'Test', description: 'Desc' });
      if (!result.ok) throw new Error('Expected ok');

      expect(store.delete(result.value.id)).toBe(true);
      expect(store.get(result.value.id)).toBeUndefined();
      expect(store.count).toBe(0);
    });

    it('returns false for non-existent task', () => {
      expect(store.delete('nonexistent')).toBe(false);
    });
  });

  describe('counts', () => {
    it('returns counts by status', () => {
      store.create({ title: 'A', description: 'a' });
      store.create({ title: 'B', description: 'b' });
      const result = store.create({ title: 'C', description: 'c' });
      if (!result.ok) throw new Error('Expected ok');
      store.update(result.value.id, { status: TaskStatus.DONE });

      const counts = store.countsByStatus();
      expect(counts[TaskStatus.TODO]).toBe(2);
      expect(counts[TaskStatus.DONE]).toBe(1);
    });

    it('returns counts by priority', () => {
      store.create({ title: 'A', description: 'a', priority: TaskPriority.HIGH });
      store.create({ title: 'B', description: 'b', priority: TaskPriority.HIGH });
      store.create({ title: 'C', description: 'c', priority: TaskPriority.LOW });

      const counts = store.countsByPriority();
      expect(counts[TaskPriority.HIGH]).toBe(2);
      expect(counts[TaskPriority.LOW]).toBe(1);
    });
  });

  describe('import/export', () => {
    it('exports and imports tasks', () => {
      store.create({ title: 'A', description: 'a' });
      store.create({ title: 'B', description: 'b' });

      const exported = store.export();
      expect(exported.length).toBe(2);

      const newStore = new TaskStore();
      newStore.import(exported);
      expect(newStore.count).toBe(2);
      expect(newStore.list()[0]!.title).toBe('A');
    });
  });
});
