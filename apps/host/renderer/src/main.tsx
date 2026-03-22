import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App.js";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing #root element for host renderer.");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatFatalDetail(error: unknown): string {
  if (error instanceof Error) {
    if (error.stack !== undefined && error.stack.trim() !== "") {
      return error.stack;
    }

    if (error.message.trim() !== "") {
      return error.message;
    }
  }

  if (typeof error === "string" && error.trim() !== "") {
    return error;
  }

  return "Unknown renderer bootstrap error.";
}

function renderBootstrapFatal(title: string, detail: string): void {
  rootElement.innerHTML = `
    <main class="host-shell host-shell-single">
      <section class="panel fatal-panel">
        <p class="eyebrow">Host Renderer Error</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="fatal-copy">The renderer failed before the host UI could finish mounting.</p>
        <pre class="fatal-detail">${escapeHtml(detail)}</pre>
      </section>
    </main>
  `;
}

window.addEventListener("error", (event) => {
  console.error("[renderer] window error", event.error ?? event.message);
  renderBootstrapFatal("Host renderer crashed.", formatFatalDetail(event.error ?? event.message));
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[renderer] unhandled rejection", event.reason);
  renderBootstrapFatal(
    "Host renderer rejected during bootstrap.",
    formatFatalDetail(event.reason),
  );
});

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  console.error("[renderer] failed to mount", error);
  renderBootstrapFatal("Host renderer failed to mount.", formatFatalDetail(error));
}
