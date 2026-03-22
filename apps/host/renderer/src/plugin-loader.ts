import type { ComponentType } from "react";

import {
  resolveGamePlugin,
  type GameCentralProps,
  type GamePluginModuleLike,
} from "@game-hub/sdk";

interface CentralComponentModule {
  default?: ComponentType<GameCentralProps<Record<string, unknown>>>;
}

const pluginLoaders = {
  debug: async () => {
    const pluginModule = (await import("@game-hub/debug")) as unknown as GamePluginModuleLike;
    return resolveGamePlugin(pluginModule)
      .central as ComponentType<GameCentralProps<Record<string, unknown>>>;
  },
  snake: async () => {
    const pluginModule = (await import("@game-hub/snake")) as unknown as GamePluginModuleLike;
    return resolveGamePlugin(pluginModule)
      .central as ComponentType<GameCentralProps<Record<string, unknown>>>;
  },
  trivia: async () => {
    const pluginModule = (await import("@game-hub/trivia/central")) as unknown as CentralComponentModule;
    return (pluginModule.default as ComponentType<GameCentralProps<Record<string, unknown>>> | undefined) ?? null;
  },
} as const;

export async function loadCentralPluginComponent(
  pluginId: string,
): Promise<ComponentType<GameCentralProps<Record<string, unknown>>> | null> {
  const loader = pluginLoaders[pluginId as keyof typeof pluginLoaders];

  if (loader === undefined) {
    return null;
  }

  return loader();
}
