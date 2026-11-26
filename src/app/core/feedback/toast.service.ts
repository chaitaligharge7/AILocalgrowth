import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  message: string;
  durationMs: number;
}

const MAX_VISIBLE_TOASTS = 4;
const DEDUPE_WINDOW_MS = 800;

/**
 * Global reusable toast notification service used across all modules.
 *
 * Automatically triggered by `mutationFeedbackInterceptor` for every
 * create (`POST`), update (`PUT`/`PATCH`), and delete (`DELETE`) API call,
 * and can also be injected directly by any component or service for custom
 * feedback messages.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private lastKey = '';
  private lastAt = 0;

  private readonly itemsSignal = signal<ToastItem[]>([]);
  readonly toasts = this.itemsSignal.asReadonly();

  success(message: string, title = 'Success', durationMs = 4000): number {
    return this.show('success', message, title, durationMs);
  }

  error(message: string, title = 'Action failed', durationMs = 5500): number {
    return this.show('error', message, title, durationMs);
  }

  info(message: string, title = 'Info', durationMs = 4000): number {
    return this.show('info', message, title, durationMs);
  }

  warning(message: string, title = 'Notice', durationMs = 4500): number {
    return this.show('warning', message, title, durationMs);
  }

  show(type: ToastType, message: string, title: string, durationMs = 4000): number {
    const cleanMessage = message.trim();
    if (!cleanMessage) {
      return -1;
    }

    const now = Date.now();
    const dedupeKey = `${type}:${cleanMessage}`;
    if (dedupeKey === this.lastKey && now - this.lastAt < DEDUPE_WINDOW_MS) {
      return -1;
    }
    this.lastKey = dedupeKey;
    this.lastAt = now;

    const id = this.nextId++;
    const item: ToastItem = { id, type, title, message: cleanMessage, durationMs };

    this.itemsSignal.update((list) => {
      const next = [...list, item];
      if (next.length > MAX_VISIBLE_TOASTS) {
        const overflow = next.splice(0, next.length - MAX_VISIBLE_TOASTS);
        for (const old of overflow) {
          this.clearTimer(old.id);
        }
      }
      return next;
    });

    if (durationMs > 0) {
      const timer = setTimeout(() => this.dismiss(id), durationMs);
      this.timers.set(id, timer);
    }

    return id;
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.itemsSignal.update((list) => list.filter((item) => item.id !== id));
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.itemsSignal.set([]);
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
