import { describe, expect, it } from "vitest";

import { PluginRegistry } from "../src/plugin-registry.js";

describe("PluginRegistry", () => {
  it("fails closed for untrusted plugins by default", async () => {
    const registry = new PluginRegistry();

    await expect(registry.loadPlugin("evil-plugin")).rejects.toThrow(
      /first-party trust policy/,
    );
  });
});
