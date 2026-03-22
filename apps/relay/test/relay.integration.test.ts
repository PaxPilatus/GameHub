import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";

import { PROTOCOL_VERSION, type HelloAckMessage, type InputMessage, type PlayerJoinedMessage } from "@game-hub/protocol";

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

let relay: RelayServer | null = null;

afterEach(async () => {
  if (relay !== null) {
    await relay.close();
    relay = null;
  }
});

describe("relay integration", () => {
  it("creates a session and forwards mobile input to the host", async () => {
    relay = createRelayServer({
      cleanupIntervalMs: 50,
      host: "127.0.0.1",
      port: 0,
    });

    const { port } = await relay.listen();
    const baseUrl = `http://127.0.0.1:${port}`;

    const sessionResponse = await fetch(`${baseUrl}/api/session/create`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ttlMs: 120000,
      }),
    });

    expect(sessionResponse.status).toBe(201);
    const sessionPayload = (await sessionResponse.json()) as {
      hostSecret: string;
      joinUrl: string;
      sessionId: string;
    };

    expect(sessionPayload.joinUrl).toContain(sessionPayload.sessionId);

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

    const mobileSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/mobile`);
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

    const hostInputPromise = waitForMessageType<InputMessage>(hostSocket, "input");

    mobileSocket.send(
      JSON.stringify({
        action: "direction",
        id: "mobile-input-1",
        playerId: mobileHelloAck.playerId,
        sequence: 1,
        sentAt: Date.now(),
        type: "input",
        value: {
          dir: "left",
        },
      }),
    );

    const forwardedInput = await hostInputPromise;
    expect(forwardedInput.action).toBe("direction");
    expect(forwardedInput.value).toEqual({ dir: "left" });
    expect(forwardedInput.playerId).toBe(mobileHelloAck.playerId);

    await closeSocket(mobileSocket);
    await closeSocket(hostSocket);
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

