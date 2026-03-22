import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
const pluginViews = {
    snake: {
        displayName: "Snake",
        render(props) {
            const state = isRecord(props.gameState?.state) ? props.gameState.state : null;
            const steps = typeof state?.steps === "number" ? state.steps : props.gameState?.tick ?? 0;
            return (_jsxs(_Fragment, { children: [_jsxs("p", { className: "plugin-copy", children: ["Richtungs-Pad fuer den laufenden Snake-Controller. Schritte: ", _jsx("strong", { children: steps })] }), _jsxs("div", { className: "direction-grid", children: [_jsx("button", { type: "button", onClick: () => props.sendInput("move", "up"), children: "Up" }), _jsx("button", { type: "button", onClick: () => props.sendInput("move", "left"), children: "Left" }), _jsx("button", { type: "button", onClick: () => props.sendInput("move", "right"), children: "Right" }), _jsx("button", { type: "button", onClick: () => props.sendInput("move", "down"), children: "Down" })] })] }));
        },
    },
    trivia: {
        displayName: "Trivia",
        render(props) {
            return (_jsxs(_Fragment, { children: [_jsx("p", { className: "plugin-copy", children: "Antwort-Pad fuer Trivia. Die eigentliche Rundenauswertung bleibt host-autoritativ." }), _jsxs("div", { className: "answer-grid", children: [_jsx("button", { type: "button", onClick: () => props.sendInput("answer", "A"), children: "Answer A" }), _jsx("button", { type: "button", onClick: () => props.sendInput("answer", "B"), children: "Answer B" }), _jsx("button", { type: "button", onClick: () => props.sendInput("answer", "C"), children: "Answer C" }), _jsx("button", { type: "button", onClick: () => props.sendInput("answer", "D"), children: "Answer D" })] }), props.role === "moderator" ? (_jsx("button", { className: "secondary-action", type: "button", onClick: () => props.sendInput("next_round", null), children: "Next Round" })) : null] }));
        },
    },
};
export function renderPluginView(gameId, props) {
    const descriptor = pluginViews[gameId];
    if (descriptor === undefined) {
        return (_jsxs("p", { className: "plugin-copy", children: ["Keine mobile UI fuer ", _jsx("strong", { children: gameId }), " registriert."] }));
    }
    return (_jsxs(_Fragment, { children: [_jsxs("header", { className: "plugin-header", children: [_jsx("h3", { children: descriptor.displayName }), _jsx("span", { children: props.phase.replace(/_/g, " ") })] }), descriptor.render(props)] }));
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
//# sourceMappingURL=plugins.js.map