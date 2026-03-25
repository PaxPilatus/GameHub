import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";

import {
  PROTOCOL_VERSION,
  type ErrorMessage,
  type HelloAckMessage,
  type InputMessage,
  type PlayerJoinedMessage,
} from "@game-hub/protocol";

import { createRelayServer, type RelayServer } from "../src/server.js";

function rawDataToJson<TMessage>(data: RawData): TMessage {
  if (typeof data === "string") {
    return JSON.parse(data) as TMessage;
  }

  if (data instanceof Buffer) {
    return JSON.parse(data.toString("utf8")) as TMessage;
  }

  if (Array.isArray(data)) {
    return JSON.parse(Buffer.concat(data).toString("utf8")) as TMessage;
  }

  return JSON.parse(Buffer.from(data).toString("utf8")) as TMessage;
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      socket.off("open", onOpen);
      socket.off("error", onError);
    };

    socket.on("open", onOpen);
    socket.on("error", onError);
  });
}

function waitForMessageType<TMessage extends { type: string }>(
  socket: WebSocket,
  messageType: TMessage["type"],
): Promise<TMessage> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: RawData) => {
      const message = rawDataToJson<TMessage>(data);

      if (message.type !== messageType) {
        return;
      }

      cleanup();
      resolve(message);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error(`Socket closed before receiving ${messageType}.`));
    };

    const cleanup = () => {
      socket.off("message", onMessage);
      socket.off("error", onError);
      socket.off("close", onClose);
    };

    socket.on("message", onMessage);
    socket.on("error", onError);
    socket.on("close", onClose);
  });
}

function waitForUnexpectedResponse(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    const onUnexpectedResponse = (
      _request: unknown,
      response: { statusCode?: number },
    ) => {
      cleanup();
      resolve(response.statusCode ?? 0);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      socket.off("unexpected-response", onUnexpectedResponse);
      socket.off("error", onError);
    };

    socket.on("unexpected-response", onUnexpectedResponse);
    socket.on("error", onError);
  });
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }

  await new Promise<void>((resolve) => {
    socket.once("close", () => {
      resolve();
    });
    socket.close();
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createMobileSocket(port: number, origin: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/ws/mobile`, {
    headers: {
      Origin: origin,
    },
  });
}

async function createSession(baseUrl: string): Promise<{
  hostSecret: string;
  joinUrl: string;
  sessionId: string;
}> {
  const sessionResponse = await fetch(`${baseUrl}/api/session/create`, {
    body: JSON.stringify({ ttlMs: 120000 }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  expect(sessionResponse.status).toBe(201);
  return (await sessionResponse.json()) as {
    hostSecret: string;
    joinUrl: string;
    sessionId: string;
  };
}

let relay: RelayServer | null = null;

afterEach(async () => {
  if (relay !== null) {
    await relay.close();
    relay = null;
  }
});

describe("relay integration", () => {
  it("creates a session, rejects token leakage to the host, and forwards ordered input", async () => {
    relay = createRelayServer({
      cleanupIntervalMs: 50,
      host: "127.0.0.1",
      port: 0,
    });

    const { port } = await relay.listen();
    const baseUrl = `http://127.0.0.1:${port}`;
    const sessionPayload = await createSession(baseUrl);

    expect(sessionPayload.joinUrl).toBe(
      `${baseUrl}/?sessionId=${sessionPayload.sessionId}`,
    );

    const hostSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/host`);
    await waitForOpen(hostSocket);

    const hostHelloAckPromise = waitForMessageType<HelloAckMessage>(
      hostSocket,
      "hello_ack",
    );

    hostSocket.send(
      JSON.stringify({
        clientKind: "host",
        id: "host-hello",
        protocolVersion: PROTOCOL_VERSION,
        sentAt: Date.now(),
        sessionId: sessionPayload.sessionId,
        token: sessionPayload.hostSecret,
        type: "hello",
      }),
    );

    await hostHelloAckPromise;

    const hostPlayerJoinedPromise = waitForMessageType<PlayerJoinedMessage>(
      hostSocket,
      "player_joined",
    );

    const mobileSocket = createMobileSocket(port, baseUrl);
    await waitForOpen(mobileSocket);

    const mobileHelloAckPromise = waitForMessageType<HelloAckMessage>(
      mobileSocket,
      "hello_ack",
    );

    mobileSocket.send(
      JSON.stringify({
        clientKind: "mobile",
        id: "mobile-hello",
        name: "Alice",
        protocolVersion: PROTOCOL_VERSION,
        sentAt: Date.now(),
        sessionId: sessionPayload.sessionId,
        type: "hello",
      }),
    );

    const mobileHelloAck = await mobileHelloAckPromise;
    expect(mobileHelloAck.playerId).toBeDefined();
    expect(mobileHelloAck.playerToken).toBeDefined();

    const playerJoined = await hostPlayerJoinedPromise;
    expect(playerJoined.playerName).toBe("Alice");
    expect(playerJoined.playerToken).toBeUndefined();

    const firstHostInputPromise = waitForMessageType<InputMessage>(hostSocket, "input");

    mobileSocket.send(
      JSON.stringify({
        action: "direction",
        id: "mobile-input-1",
        playerId: mobileHelloAck.playerId,
        sequence: 1,
        sentAt: Date.now(),
        type: "input",
        value: { dir: "left" },
      }),
    );

    const firstForwardedInput = await firstHostInputPromise;
    expect(firstForwardedInput.sequence).toBe(1);

    const relayErrorPromise = waitForMessageType<ErrorMessage>(mobileSocket, "error");
    const secondHostInputPromise = waitForMessageType<InputMessage>(hostSocket, "input");

    mobileSocket.send(
      JSON.stringify({
        action: "direction",
        id: "mobile-input-duplicate",
        playerId: mobileHelloAck.playerId,
        sequence: 1,
        sentAt: Date.now(),
        type: "input",
        value: { dir: "up" },
      }),
    );
    mobileSocket.send(
      JSON.stringify({
        action: "direction",
        id: "mobile-input-2",
        playerId: mobileHelloAck.playerId,
        sequence: 2,
        sentAt: Date.now(),
        type: "input",
        value: { dir: "right" },
      }),
    );

    const relayError = await relayErrorPromise;
    expect(relayError.code).toBe("input_out_of_order");

    const secondForwardedInput = await secondHostInputPromise;
    expect(secondForwardedInput.sequence).toBe(2);
    expect(secondForwardedInput.value).toEqual({ dir: "right" });

    await closeSocket(mobileSocket);
    await closeSocket(hostSocket);
  });

  it("preserves input ordering continuity across reconnects", async () => {
    relay = createRelayServer({
      cleanupIntervalMs: 50,
      host: "127.0.0.1",
      port: 0,
    });

    const { port } = await relay.listen();
    const baseUrl = `http://127.0.0.1:${port}`;
    const sessionPayload = await createSession(baseUrl);

    const hostSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/host`);
    await waitForOpen(hostSocket);
    const hostHelloAckPromise = waitForMessageType<HelloAckMessage>(hostSocket, "hello_ack");
    hostSocket.send(
      JSON.stringify({
        clientKind: "host",
        id: "host-hello",
        protocolVersion: PROTOCOL_VERSION,
        sentAt: Date.now(),
        sessionId: sessionPayload.sessionId,
        token: sessionPayload.hostSecret,
        type: "hello",
      }),
    );
    await hostHelloAckPromise;

    const firstMobileSocket = createMobileSocket(port, baseUrl);
    await waitForOpen(firstMobileSocket);
    const firstMobileHelloAckPromise = waitForMessageType<HelloAckMessage>(
      firstMobileSocket,
      "hello_ack",
    );
    firstMobileSocket.send(
      JSON.stringify({
        clientKind: "mobile",
        id: "mobile-hello-1",
        name: "Alice",
        protocolVersion: PROTOCOL_VERSION,
        sentAt: Date.now(),
        sessionId: sessionPayload.sessionId,
        type: "hello",
      }),
    );
    const firstHelloAck = await firstMobileHelloAckPromise;

    const firstInputPromise = waitForMessageType<InputMessage>(hostSocket, "input");
    firstMobileSocket.send(
      JSON.stringify({
        action: "direction",
        id: "mobile-input-1",
        playerId: firstHelloAck.playerId,
        sequence: 1,
        sentAt: Date.now(),
        type: "input",
        value: { dir: "left" },
      }),
    );
    expect((await firstInputPromise).sequence).toBe(1);

    await closeSocket(firstMobileSocket);

    const secondMobileSocket = createMobileSocket(port, baseUrl);
    await waitForOpen(secondMobileSocket);
    const secondMobileHelloAckPromise = waitForMessageType<HelloAckMessage>(
      secondMobileSocket,
      "hello_ack",
    );
    secondMobileSocket.send(
      JSON.stringify({
        clientKind: "mobile",
        id: "mobile-hello-2",
        protocolVersion: PROTOCOL_VERSION,
        sentAt: Date.now(),
        sessionId: sessionPayload.sessionId,
        token: firstHelloAck.playerToken,
        type: "hello",
      }),
    );
    const secondHelloAck = await secondMobileHelloAckPromise;
    expect(secondHelloAck.reconnect).toBe(true);

    const secondInputPromise = waitForMessageType<InputMessage>(hostSocket, "input");
    secondMobileSocket.send(
      JSON.stringify({
        action: "direction",
        id: "mobile-input-reconnect",
        playerId: secondHelloAck.playerId,
        sequence: 1,
        sentAt: Date.now(),
        type: "input",
        value: { dir: "up" },
      }),
    );

    const secondInput = await secondInputPromise;
    expect(secondInput.sequence).toBe(2);
    expect(secondInput.playerId).toBe(secondHelloAck.playerId);

    await closeSocket(secondMobileSocket);
    await closeSocket(hostSocket);
  });

  it("uses a dedicated host rate limit budget for realtime traffic", async () => {
    relay = createRelayServer({
      cleanupIntervalMs: 50,
      host: "127.0.0.1",
      hostRateLimitMaxMessages: 5,
      hostRateLimitWindowMs: 1000,
      port: 0,
      rateLimitMaxMessages: 2,
      rateLimitWindowMs: 1000,
    });

    const { port } = await relay.listen();
    const baseUrl = `http://127.0.0.1:${port}`;
    const sessionPayload = await createSession(baseUrl);

    const hostSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/host`);
    await waitForOpen(hostSocket);

    const hostHelloAckPromise = waitForMessageType<HelloAckMessage>(
      hostSocket,
      "hello_ack",
    );

    hostSocket.send(
      JSON.stringify({
        clientKind: "host",
        id: "host-hello",
        protocolVersion: PROTOCOL_VERSION,
        sentAt: Date.now(),
        sessionId: sessionPayload.sessionId,
        token: sessionPayload.hostSecret,
        type: "hello",
      }),
    );

    await hostHelloAckPromise;

    for (let index = 0; index < 4; index += 1) {
      hostSocket.send(
        JSON.stringify({
          id: `heartbeat-${index}`,
          sentAt: Date.now(),
          type: "heartbeat",
        }),
      );
    }

    await wait(50);
    expect(hostSocket.readyState).toBe(WebSocket.OPEN);

    await closeSocket(hostSocket);
  });

  it("rate limits create-session abuse per IP", async () => {
    relay = createRelayServer({
      createSessionRateLimitMaxRequests: 1,
      createSessionRateLimitWindowMs: 60_000,
      host: "127.0.0.1",
      port: 0,
    });

    const { port } = await relay.listen();
    const baseUrl = `http://127.0.0.1:${port}`;

    const firstResponse = await fetch(`${baseUrl}/api/session/create`, {
      body: JSON.stringify({ ttlMs: 120000 }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const secondResponse = await fetch(`${baseUrl}/api/session/create`, {
      body: JSON.stringify({ ttlMs: 120000 }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(429);
  });

  it("rejects mobile websocket origins outside the allowlist", async () => {
    relay = createRelayServer({
      host: "127.0.0.1",
      port: 0,
    });

    const { port } = await relay.listen();
    const mobileSocket = createMobileSocket(port, "https://evil.example");

    await expect(waitForUnexpectedResponse(mobileSocket)).resolves.toBe(403);
  });

  it("serves static assets with security headers", async () => {
    relay = createRelayServer({
      host: "127.0.0.1",
      port: 0,
    });

    const { port } = await relay.listen();
    const response = await fetch(`http://127.0.0.1:${port}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("uses the configured public base URL for join links", async () => {
    relay = createRelayServer({
      host: "127.0.0.1",
      port: 0,
      publicBaseUrl: "https://relay.example.test/play",
    });

    const { port } = await relay.listen();
    const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/session/create`, {
      body: JSON.stringify({
        ttlMs: 120000,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(sessionResponse.status).toBe(201);
    const sessionPayload = (await sessionResponse.json()) as {
      joinUrl: string;
      sessionId: string;
    };

    expect(sessionPayload.joinUrl).toBe(
      `https://relay.example.test/play?sessionId=${sessionPayload.sessionId}`,
    );
  });
});
