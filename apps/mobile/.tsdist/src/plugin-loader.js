import { resolveGamePlugin, } from "@game-hub/sdk";
const pluginLoaders = {
    debug: async () => {
        const pluginModule = (await import("@game-hub/debug"));
        return resolveGamePlugin(pluginModule)
            .mobile;
    },
    snake: async () => {
        const pluginModule = (await import("@game-hub/snake"));
        return resolveGamePlugin(pluginModule)
            .mobile;
    },
    trivia: async () => {
        const pluginModule = (await import("@game-hub/trivia/mobile"));
        return pluginModule.default ?? null;
    },
};
export async function loadMobilePluginComponent(pluginId) {
    const loader = pluginLoaders[pluginId];
    if (loader === undefined) {
        return null;
    }
    return loader();
}
//# sourceMappingURL=plugin-loader.js.map