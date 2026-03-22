import type { ComponentType } from "react";

import {
  resolveGamePlugin,
  type GameMobileProps,
  type GamePluginModuleLike,
} from "@game-hub/sdk";

interface MobileComponentModule {
  default?: ComponentType<GameMobileProps<Record<string, unknown>>>;
}

const pluginLoaders = {
  debug: async () => {
    const pluginModule = (await import("@game-hub/debug")) as unknown as GamePluginModuleLike;
    return resolveGamePlugin(pluginModule)
      .mobile as ComponentType<GameMobileProps<Record<string, unknown>>>;
  },
  snake: async () => {
    const pluginModule = (await import("@game-hub/snake")) as unknown as GamePluginModuleLike;
    return resolveGamePlugin(pluginModule)
      .mobile as ComponentType<GameMobileProps<Record<string, unknown>>>;
  },
  trivia: async () => {
    const pluginModule = (await import("@game-hub/trivia/mobile")) as unknown as MobileComponentModule;
    return (pluginModule.default as ComponentType<GameMobileProps<Record<string, unknown>>> | undefined) ?? null;
  },
} as const;

export async function loadMobilePluginComponent(
  pluginId: string,
): Promise<ComponentType<GameMobileProps<Record<string, unknown>>> | null> {
  const loader = pluginLoaders[pluginId as keyof typeof pluginLoaders];

  if (loader === undefined) {
    return null;
  }

  return loader();
}
