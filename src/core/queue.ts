import type { AnyEvent, FlushResult } from "./types.js";
import { generateEventId, createLogger, type Logger } from "./utils.js";

interface QueuedEvent {
  id: string;
  payload: AnyEvent;
  timestamp: number;
  retries: number;
}

interface QueueOptions {
  apiUrl: string;
  websiteId: string;
  maxBatchSize: number;
  flushInterval: number;
  debug: boolean;
  fetchImpl: typeof fetch;
  onFlushError?: (error: Error, events: AnyEvent[]) => void;
}

const MAX_RETRIES = 3;

export class EventQueue {
  private queue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private logger: Logger;
  private opts: QueueOptions;

  constructor(opts: QueueOptions) {
    this.opts = opts;
    this.logger = createLogger(opts.debug);
    this.startFlushTimer();
  }

  async enqueue(payload: AnyEvent): Promise<void> {
    const event: QueuedEvent = {
      id: generateEventId(),
      payload,
      timestamp: Date.now(),
      retries: 0,
    };
    this.queue.push(event);
    this.logger.log(`Queued ${payload.type} event (queue size: ${this.queue.length})`);

    if (this.queue.length >= this.opts.maxBatchSize) {
      this.logger.log("Max batch size reached — flushing immediately");
      await this.flush();
    }
  }

  async flush(): Promise<FlushResult> {
    if (this.isFlushing || this.queue.length === 0) {
      return { sent: 0, failed: 0, errors: [] };
    }

    this.isFlushing = true;
    const toProcess = [...this.queue];
    const result: FlushResult = { sent: 0, failed: 0, errors: [] };

    this.logger.log(`Flushing ${toProcess.length} event(s)`);

    // Send in batches
    const batches = chunk(toProcess, this.opts.maxBatchSize);

    for (const batch of batches) {
      try {
        await this.sendBatch(batch.map((e) => e.payload));
        // Remove successfully sent events from queue
        const sentIds = new Set(batch.map((e) => e.id));
        this.queue = this.queue.filter((e) => !sentIds.has(e.id));
        result.sent += batch.length;
        this.logger.log(`Sent batch of ${batch.length} event(s)`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        result.errors.push(err.message);

        // Increment retries on each event in this batch
        for (const event of batch) {
          event.retries++;
          if (event.retries >= MAX_RETRIES) {
            // Drop event after max retries
            this.queue = this.queue.filter((e) => e.id !== event.id);
            result.failed++;
            this.logger.error(`Dropping event ${event.id} after ${MAX_RETRIES} retries`);
            this.opts.onFlushError?.(err, [event.payload]);
          }
        }
      }
    }

    this.isFlushing = false;
    return result;
  }

  private async sendBatch(events: AnyEvent[]): Promise<void> {
    // Send each event individually to match your server's single-event schema.
    // If your server gains a batch endpoint later, change this to one request.
    await Promise.all(
      events.map((event) => this.sendOne(event))
    );
  }

  private async sendOne(event: AnyEvent): Promise<void> {
    const body = JSON.stringify(event);
    const response = await this.opts.fetchImpl(this.opts.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
  }

  get size(): number {
    return this.queue.length;
  }

  async shutdown(): Promise<FlushResult> {
    this.stopFlushTimer();
    return this.flush();
  }

  async clear(): Promise<void> {
    this.queue = [];
  }

  private startFlushTimer(): void {
    this.stopFlushTimer();
    this.flushTimer = setInterval(async () => {
      if (this.queue.length > 0) {
        await this.flush();
      }
    }, this.opts.flushInterval);

    // Don't keep the process alive just for analytics
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}