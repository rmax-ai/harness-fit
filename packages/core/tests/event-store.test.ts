import { describe, it, expect } from 'bun:test';
import { EventStore } from '../src/events/event-store';
import { createRunId } from '../src/types/index';

describe('EventStore', () => {
  it('emits events with incrementing sequence numbers', () => {
    const store = new EventStore(createRunId());
    store.emit('run.started');
    store.emit('model.requested', { turn: 1 });
    store.emit('model.responded', { turn: 1 });

    expect(store.count).toBe(3);
    const events = store.getAll();
    expect(events[0]!.sequenceNumber).toBe(0);
    expect(events[1]!.sequenceNumber).toBe(1);
    expect(events[2]!.sequenceNumber).toBe(2);
    expect(events[0]!.type).toBe('run.started');
  });

  it('filters events by type', () => {
    const store = new EventStore(createRunId());
    store.emit('run.started');
    store.emit('tool.requested', { name: 'read_file' });
    store.emit('tool.completed', { name: 'read_file' });
    store.emit('run.completed');

    const toolEvents = store.filterByType('tool.requested');
    expect(toolEvents.length).toBe(1);
    expect(toolEvents[0]!.data.name).toBe('read_file');
  });

  it('counts model requests and tool calls', () => {
    const store = new EventStore(createRunId());
    store.emit('model.requested');
    store.emit('model.responded');
    store.emit('model.requested');
    store.emit('model.responded');
    store.emit('tool.completed');
    store.emit('tool.completed');
    store.emit('tool.completed');

    expect(store.modelRequests).toBe(2);
    expect(store.toolCalls).toBe(3);
    expect(store.retries).toBe(0);
  });

  it('counts retries', () => {
    const store = new EventStore(createRunId());
    store.emit('retry.started');
    store.emit('retry.started');

    expect(store.retries).toBe(2);
  });

  it('returns all events as immutable snapshot', () => {
    const store = new EventStore(createRunId());
    store.emit('run.started');

    const events1 = store.getAll();
    const events2 = store.getAll();

    // Different array references
    expect(events1).not.toBe(events2);
    // Same content
    expect(events1.length).toBe(events2.length);
  });

  it('exports to JSON', () => {
    const store = new EventStore(createRunId());
    store.emit('run.started', { modelId: 'test' });
    store.emit('run.completed');

    const json = store.toJSON();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0].type).toBe('run.started');
    expect(parsed[0].data.modelId).toBe('test');
  });
});
