import type { ComponentType } from "react";

import {
  resolveGamePlugin,
  type GameMobileProps,
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

export async function loadMobilePluginDefinition(
  pluginId: string,
): Promise<GamePluginDefinition<Record<string, unknown>> | null> {
  const loader = pluginLoaders[pluginId as keyof typeof pluginLoaders];

  if (loader === undefined) {
    return null;
  }

  return loader() as Promise<GamePluginDefinition<Record<string, unknown>>>;
}

export async function loadMobilePluginComponent(
  pluginId: string,
): Promise<ComponentType<GameMobileProps<Record<string, unknown>>> | null> {
  const plugin = await loadMobilePluginDefinition(pluginId);
  return plugin?.ui.mobile ?? null;
}
