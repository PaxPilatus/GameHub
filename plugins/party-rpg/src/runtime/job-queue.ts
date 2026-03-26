import type { QueuedWorkUnit } from "./job-types.js";

/**
 * FIFO queue with a hard concurrency limit. When a worker finishes, the next item starts immediately.
 * Invalid items are dropped at dequeue time (not counted as running).
 */
export function createLimitedParallelQueue(maxConcurrency: number) {
  if (maxConcurrency < 1) {
    throw new Error("job_queue_bad_concurrency");
  }

  const pending: QueuedWorkUnit[] = [];
  let running = 0;

  function pump(): void {
    while (running < maxConcurrency && pending.length > 0) {
      while (pending.length > 0) {
        const head = pending[0];
        if (head === undefined || head.isValid()) {
          break;
        }
        pending.shift();
      }
      const unit = pending.shift();
      if (unit === undefined) {
        return;
      }
      if (!unit.isValid()) {
        continue;
      }
      running += 1;
      void unit
        .run()
        .catch(() => {
          /* errors handled inside run */
        })
        .finally(() => {
          running -= 1;
          pump();
        });
    }
  }

  return {
    /** Enqueue work; pump starts workers up to maxConcurrency. */
    enqueue(unit: QueuedWorkUnit): void {
      pending.push(unit);
      pump();
    },

    /** Remove queued (not running) items matching predicate. */
    invalidateQueued(predicate: (id: string) => boolean): void {
      for (let i = pending.length - 1;i >= 0;i -= 1) {
        const item = pending[i];
        if (item !== undefined && predicate(item.id)) {
          pending.splice(i, 1);
        }
      }
    },

    /** For tests / introspection */
    get lengthQueued(): number {
      return pending.length;
    },

    get lengthRunning(): number {
      return running;
    },
  };
}

export type LimitedParallelQueue = ReturnType<typeof createLimitedParallelQueue>;
