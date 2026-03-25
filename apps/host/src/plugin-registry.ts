import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  resolveGamePlugin,
  type GameManifest,
  type GamePluginDefinition,
  type GamePluginModuleLike,
} from "@game-hub/sdk";

const FIRST_PARTY_PLUGIN_IDS = new Set(["debug", "snake", "trivia"]);

function defaultPluginsDir(): string {
  return resolve(fileURLToPath(new URL("../../../plugins/", import.meta.url)));
}

function shouldAllowUntrustedPlugins(): boolean {
  return process.env.ALLOW_UNTRUSTED_PLUGINS === "true";
}

function isTrustedPlugin(pluginId: string): boolean {
  return shouldAllowUntrustedPlugins() || FIRST_PARTY_PLUGIN_IDS.has(pluginId);
}

interface PluginManifestRecord {
  manifest: GameManifest;
  modulePath: string;
}

export class PluginRegistry {
  private readonly manifestCache = new Map<string, PluginManifestRecord>();
  private readonly moduleCache = new Map<string, GamePluginDefinition>();
  private readonly pluginsDir: string;

  constructor(pluginsDir = defaultPluginsDir()) {
    this.pluginsDir = pluginsDir;
  }

  async listManifests(): Promise<GameManifest[]> {
    if (this.manifestCache.size === 0) {
      await this.scanPlugins();
    }

    return [...this.manifestCache.values()]
      .map((entry) => ({ ...entry.manifest }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async loadPlugin(pluginId: string): Promise<GamePluginDefinition> {
    if (!isTrustedPlugin(pluginId)) {
      throw new Error(
        `Plugin ${pluginId} is blocked by the first-party trust policy. Set ALLOW_UNTRUSTED_PLUGINS=true to override.`,
      );
    }

    if (this.moduleCache.has(pluginId)) {
      const cached = this.moduleCache.get(pluginId);
      if (cached !== undefined) {
        return cached;
      }
    }

    if (!this.manifestCache.has(pluginId)) {
      await this.scanPlugins();
    }

    const manifestRecord = this.manifestCache.get(pluginId);

    if (manifestRecord === undefined) {
      throw new Error(`Unknown plugin: ${pluginId}`);
    }

    const pluginModule = (await import(
      pathToFileURL(manifestRecord.modulePath).href
    )) as GamePluginModuleLike;
    const plugin = resolveGamePlugin(pluginModule);

    if (plugin.manifest.id !== pluginId) {
      throw new Error(
        `Plugin manifest mismatch for ${pluginId}: loaded ${plugin.manifest.id}.`,
      );
    }

    this.moduleCache.set(pluginId, plugin);
    return plugin;
  }

  private async scanPlugins(): Promise<void> {
    this.manifestCache.clear();

    const entries = await readdir(this.pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (!shouldAllowUntrustedPlugins() && !FIRST_PARTY_PLUGIN_IDS.has(entry.name)) {
        console.warn(
          `[host] plugin_blocked: Skipping untrusted plugin directory ${entry.name}. Set ALLOW_UNTRUSTED_PLUGINS=true to allow non-first-party plugins.`,
        );
        continue;
      }

      const modulePath = resolve(this.pluginsDir, entry.name, "dist", "index.js");
      const pluginModule = (await import(
        pathToFileURL(modulePath).href
      )) as GamePluginModuleLike;
      const plugin = resolveGamePlugin(pluginModule);

      if (!isTrustedPlugin(plugin.manifest.id)) {
        console.warn(
          `[host] plugin_blocked: Skipping untrusted plugin ${plugin.manifest.id}. Set ALLOW_UNTRUSTED_PLUGINS=true to allow it.`,
        );
        continue;
      }

      this.manifestCache.set(plugin.manifest.id, {
        manifest: { ...plugin.manifest },
        modulePath,
      });
    }
  }
}

