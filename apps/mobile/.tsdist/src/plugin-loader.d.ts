import type { ComponentType } from "react";
import { type GameMobileProps, type GamePluginDefinition } from "@game-hub/sdk";
export declare function loadMobilePluginDefinition(pluginId: string): Promise<GamePluginDefinition<Record<string, unknown>> | null>;
export declare function loadMobilePluginComponent(pluginId: string): Promise<ComponentType<GameMobileProps<Record<string, unknown>>> | null>;
//# sourceMappingURL=plugin-loader.d.ts.map