import type { RunEvent, RunEventType, RunId } from '../types/index';

/**
 * Append-only event store for a single run.
 * Events are emitted during the run and flushed to storage on completion.
 * This is the in-memory buffer — SQLite persistence happens in @harnessfit/storage.
 */
export class EventStore {
  private events: RunEvent[] = [];

  constructor(private readonly runId: RunId) {}

  /** Emit a typed event. Returns the event for chaining. */
  emit(type: RunEventType, data: Record<string, unknown> = {}): RunEvent {
    const event: RunEvent = {
      type,
      runId: this.runId,
      sequenceNumber: this.events.length,
      timestamp: new Date().toISOString(),
      data,
    };
    this.events.push(event);
    return event;
  }

  /** Get all events (immutable snapshot). */
  getAll(): readonly RunEvent[] {
    return [...this.events];
  }

  /** Number of events emitted. */
  get count(): number {
    return this.events.length;
  }

  /** Get events of a specific type. */
  filterByType(type: RunEventType): readonly RunEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /** Count model calls made in this run. */
  get modelRequests(): number {
    return this.filterByType('model.requested').length;
  }

  /** Count tool calls made in this run. */
  get toolCalls(): number {
    return this.filterByType('tool.completed').length;
  }

  /** Count retry attempts. */
  get retries(): number {
    return this.filterByType('retry.started').length;
  }

  /** Export as JSON array for persistence. */
  toJSON(): string {
    return JSON.stringify(this.events);
  }
}
