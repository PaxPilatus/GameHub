import type { GameStateMessage, HostPlayerState, PlayerRole, SessionPhase } from "@game-hub/protocol";
import type { ReactNode } from "react";
export interface PluginViewProps {
    gameState: GameStateMessage | null;
    phase: SessionPhase;
    players: HostPlayerState[];
    role: PlayerRole | null;
    sendInput: (kind: string, payload?: string | number | boolean | null) => void;
}
export declare function renderPluginView(gameId: string, props: PluginViewProps): ReactNode;
//# sourceMappingURL=plugins.d.ts.map