import { resolveGamePlugin, } from "@game-hub/sdk";
const pluginLoaders = {
    debug: async () => {
        const pluginModule = (await import("@game-hub/debug"));
        return resolveGamePlugin(pluginModule);
    },
    snake: async () => {
        const pluginModule = (await import("@game-hub/snake"));
        return resolveGamePlugin(pluginModule);
    },
    trivia: async () => {
        const pluginModule = (await import("@game-hub/trivia"));
        return resolveGamePlugin(pluginModule);
    },
};
export async function loadMobilePluginDefinition(pluginId) {
    const loader = pluginLoaders[pluginId];
    if (loader === undefined) {
        return null;
    }
    return loader();
}
export async function loadMobilePluginComponent(pluginId) {
    const plugin = await loadMobilePluginDefinition(pluginId);
    return plugin?.ui.mobile ?? null;
}
//# sourceMappingURL=plugin-loader.js.map