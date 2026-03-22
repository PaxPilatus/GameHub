/// <reference types="vite/client" />

import type {
  HostDiagnosticEvent,
  HostSnapshot,
  RendererInitialState,
} from "../../src/types.js";

declare global {
  interface Window {
    hostApi: {
      generateQrCode(value: string): Promise<string>;
      getInitialState(): Promise<RendererInitialState>;
      onDiagnostic(listener: (event: HostDiagnosticEvent) => void): () => void;
      onSnapshot(listener: (snapshot: HostSnapshot) => void): () => void;
      restartSession(): Promise<void>;
      selectGame(gameId: string): Promise<void>;
      sendPluginAction(
        action: string,
        payload?: string | number | boolean | null,
      ): Promise<void>;
      setModerator(playerId: string): Promise<void>;
      startGame(): Promise<void>;
      stopGame(): Promise<void>;
    };
  }
}

export {};
