import type { InputValue } from "@game-hub/protocol";
import type {
  HostDiagnosticEvent,
  HostSnapshot,
  RendererInitialState,
} from "./types.js";

declare global {
  interface Window {
    hostApi: {
      getInitialState(): Promise<RendererInitialState>;
      onDiagnostic(listener: (event: HostDiagnosticEvent) => void): () => void;
      onSnapshot(listener: (snapshot: HostSnapshot) => void): () => void;
      restartSession(): Promise<void>;
      selectGame(gameId: string): Promise<void>;
      sendPluginAction(
        action: string,
        payload?: InputValue,
      ): Promise<void>;
      setModerator(playerId: string): Promise<void>;
      startGame(): Promise<void>;
      stopGame(): Promise<void>;
    };
  }
}

export {};
