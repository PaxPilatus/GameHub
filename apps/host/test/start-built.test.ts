import { createServer } from "node:net";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  assertPortAvailable,
  formatPortInUseMessage,
  resolveBuiltRunConfig,
  waitForOutputLine,
} from "../../../scripts/start-built.mjs";

describe("start-built helpers", () => {
  it("formats the port-in-use message", () => {
    expect(formatPortInUseMessage("127.0.0.1", 8787)).toContain("127.0.0.1:8787");
  });

  it("reads relay configuration from the environment", () => {
    expect(
      resolveBuiltRunConfig({
        RELAY_HOST: "0.0.0.0",
        RELAY_PORT: "9000",
        RELAY_PUBLIC_BASE_URL: "https://relay.example.com/",
      }),
    ).toEqual({
      relayBaseUrl: "http://0.0.0.0:9000",
      relayHost: "0.0.0.0",
      relayPort: 9000,
      relayPublicBaseUrl: "https://relay.example.com/",
    });
  });

  it("rejects when the relay port is already in use", async () => {
    const server = createServer();

    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.once("error", rejectPromise);
      server.listen(0, "127.0.0.1", () => {
        resolvePromise();
      });
    });

    const address = server.address();

    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP port for the temporary server.");
    }

    await expect(assertPortAvailable("127.0.0.1", address.port)).rejects.toThrow(
      "already in use",
    );

    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => {
        if (error !== undefined) {
          rejectPromise(error);
          return;
        }

        resolvePromise();
      });
    });
  });

  it("waits until the relay ready line appears", async () => {
    const stream = new PassThrough();
    const waitPromise = waitForOutputLine(
      stream,
      (line) => line.includes("[relay] listening on "),
      1_000,
    );

    stream.write("booting\n");
    stream.write("[relay] listening on http://127.0.0.1:8787\n");

    await expect(waitPromise).resolves.toContain("[relay] listening on ");
  });
});
