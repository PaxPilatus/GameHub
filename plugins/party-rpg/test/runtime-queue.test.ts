import { describe, expect, it, vi } from "vitest";

import { createLimitedParallelQueue } from "../src/runtime/job-queue.js";

describe("limited parallel queue", () => {
  it("never runs more than maxConcurrency jobs at once", async () => {
    const q = createLimitedParallelQueue(3);
    let concurrent = 0;
    let peak = 0;

    const done: Promise<void>[] = [];
    for (let i = 0;i < 8;i += 1) {
      q.enqueue({
        id: `j${String(i)}`,
        isValid: () => true,
        run: async () => {
          concurrent += 1;
          peak = Math.max(peak, concurrent);
          await new Promise<void>((r) => {
            setTimeout(r, 5);
          });
          concurrent -= 1;
        },
      });
      done.push(
        new Promise<void>((r) => {
          setTimeout(r, 30);
        }),
      );
    }

    await Promise.all(done);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("skips invalidated queued work and drains", async () => {
    const q = createLimitedParallelQueue(2);
    const run = vi.fn();
    q.enqueue({
      id: "a",
      isValid: () => false,
      run: async () => {
        run();
      },
    });
    await new Promise<void>((r) => {
      setTimeout(r, 15);
    });
    expect(run).not.toHaveBeenCalled();
    expect(q.lengthQueued).toBe(0);
  });
});
