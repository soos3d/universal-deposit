/**
 * Typed EventEmitter for deposit lifecycle events
 */

import type { Logger } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventMap = Record<string, (...args: any[]) => void>;

const NOOP_LOGGER: Logger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

const DEFAULT_MAX_LISTENERS = 20;

export class TypedEventEmitter<T extends EventMap = EventMap> {
  private listeners: Map<keyof T, Set<T[keyof T]>> = new Map();
  private maxListeners: number = DEFAULT_MAX_LISTENERS;
  protected readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? NOOP_LOGGER;
  }

  setMaxListeners(n: number): this {
    this.maxListeners = n;
    return this;
  }

  on<K extends keyof T>(event: K, listener: T[K]): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener);
    if (set.size > this.maxListeners) {
      this.logger.warn(
        `[EventEmitter] Possible memory leak: ${set.size} listeners for "${String(event)}" (max ${this.maxListeners}). Use setMaxListeners() to increase.`
      );
    }
    return this;
  }

  off<K extends keyof T>(event: K, listener: T[K]): this {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
    return this;
  }

  once<K extends keyof T>(event: K, listener: T[K]): this {
    const onceWrapper = ((...args: Parameters<T[K]>) => {
      this.off(event, onceWrapper as T[K]);
      (listener as (...args: any[]) => void)(...args);
    }) as T[K];
    return this.on(event, onceWrapper);
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): boolean {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners || eventListeners.size === 0) {
      return false;
    }
    eventListeners.forEach((listener) => {
      try {
        (listener as (...args: any[]) => void)(...args);
      } catch (error) {
        this.logger.error(`Error in event listener for "${String(event)}":`, error);
      }
    });
    return true;
  }

  removeAllListeners<K extends keyof T>(event?: K): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  listenerCount<K extends keyof T>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
