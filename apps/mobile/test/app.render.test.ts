import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App.js";

function createWindowStub(search: string) {
  return {
    location: {
      hash: "",
      href: `http://127.0.0.1:8787/${search}`,
      host: "127.0.0.1:8787",
      pathname: "/",
      protocol: "http:",
      search,
    },
    localStorage: {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => undefined,
    },
  };
}

describe("mobile App render", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the join form when no sessionId is present", () => {
    vi.stubGlobal("window", createWindowStub(""));

    const html = renderToStaticMarkup(React.createElement(App));

    expect(html).toContain("Join Session");
    expect(html).toContain("Session ID or join URL");
    expect(html).not.toContain("Missing sessionId");
  });
});
