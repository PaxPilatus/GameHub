import type { ComponentType } from "react";

import {
  resolveGamePlugin,
  type GameCentralProps,
  type GamePluginDefinition,
  type GamePluginModuleLike,
} from "@game-hub/sdk";

const pluginLoaders = {
  debug: async () => {
    const pluginModule = (await import("@game-hub/debug")) as unknown as GamePluginModuleLike;
    return resolveGamePlugin(pluginModule);
  },
  snake: async () => {
    const pluginModule = (await import("@game-hub/snake")) as unknown as GamePluginModuleLike;
    return resolveGamePlugin(pluginModule);
  },
  trivia: async () => {
    const pluginModule = (await import("@game-hub/trivia")) as unknown as GamePluginModuleLike;
    return resolveGamePlugin(pluginModule);
  },
  "party-rpg": async () => {
    const pluginModule = (await import("@game-hub/party-rpg")) as unknown as GamePluginModuleLike;
    return resolveGamePlugin(pluginModule);
  },
} as const;

export async function loadCentralPluginDefinition(
  pluginId: string,
): Promise<GamePluginDefinition<Record<string, unknown>> | null> {
  const loader = pluginLoaders[pluginId as keyof typeof pluginLoaders];

  if (loader === undefined) {
    return null;
  }

  return loader() as Promise<GamePluginDefinition<Record<string, unknown>>>;
}

export async function loadCentralPluginComponent(
  pluginId: string,
): Promise<ComponentType<GameCentralProps<Record<string, unknown>>> | null> {
  const plugin = await loadCentralPluginDefinition(pluginId);
  return plugin?.ui.central ?? null;
}
