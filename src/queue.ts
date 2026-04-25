// src/eventQueue.ts
import { generateEventId } from "./utils";

const QUEUE_STORAGE_KEY = "datafast_event_queue";
const MAX_RETRIES = 3;

export class EventQueue {
  queue: any[];
  flushTimer: any;
  isFlushing: boolean;
  storage: any;
  network: any;
  apiUrl: string;
  userAgent: string;
  origin: string | undefined;
  flushInterval: number;
  maxQueueSize: number;
  onFlushError: ((error: any, event: any) => void) | undefined;
  onSuccessfulSend: ((payload: any, parsedBody: any) => void) | undefined;

  constructor(options: any) {
    this.queue = [];
    this.flushTimer = null;
    this.isFlushing = false;
    this.storage = options.storage;
    this.network = options.network;
    this.apiUrl = options.apiUrl;
    this.userAgent = options.userAgent;
    this.origin = options.origin;
    this.flushInterval = options.flushInterval ?? 30000;
    this.maxQueueSize = options.maxQueueSize ?? 20;
    this.onFlushError = options.onFlushError;
    this.onSuccessfulSend = options.onSuccessfulSend;
  }

  async init() {
    try {
      const stored = await this.storage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) this.queue = parsed;
      }
    } catch {
      this.queue = [];
    }

    this.startFlushTimer();

    if (this.network?.onConnectionChange) {
      this.network.onConnectionChange((isConnected: boolean) => {
        if (isConnected) this.flush();
      });
    }
  }

  async enqueue(payload: any) {
    const event = {
      id: generateEventId(),
      payload,
      timestamp: Date.now(),
      retries: 0,
    };
    this.queue.push(event);
    await this.persistQueue();
    if (this.queue.length >= this.maxQueueSize) this.flush();
  }

  async flush() {
    if (this.isFlushing || this.queue.length === 0) return;

    if (this.network) {
      const isConnected = await this.network.isConnected();
      if (!isConnected) return;
    }

    this.isFlushing = true;
    const eventsToProcess = [...this.queue];

    for (const event of eventsToProcess) {
      try {
        await this.sendEvent(event.payload);
        this.queue = this.queue.filter((e: any) => e.id !== event.id);
      } catch (error) {
        event.retries++;
        if (event.retries >= MAX_RETRIES) {
          this.queue = this.queue.filter((e: any) => e.id !== event.id);
          if (this.onFlushError) this.onFlushError(error, event);
        }
      }
    }

    await this.persistQueue();
    this.isFlushing = false;
  }

  async sendEvent(payload: any) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": this.userAgent,
    };

    if (this.origin) headers["Origin"] = this.origin;

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let parsedBody: any = null;
    try {
      const text = await response.text();
      if (text) parsedBody = JSON.parse(text);
    } catch {}

    this.onSuccessfulSend?.(payload, parsedBody);
  }

  async persistQueue() {
    try {
      await this.storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch {}
  }

  startFlushTimer() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => { this.flush(); }, this.flushInterval);
  }

  async shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  get size() {
    return this.queue.length;
  }

  async clear() {
    this.queue = [];
    await this.persistQueue();
  }
}