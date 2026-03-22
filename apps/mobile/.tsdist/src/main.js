import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";
const rootElement = document.getElementById("root");
if (rootElement === null) {
    throw new Error("Missing #root element for mobile app.");
}
ReactDOM.createRoot(rootElement).render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
//# sourceMappingURL=main.js.map