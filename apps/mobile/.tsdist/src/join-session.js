const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
export function buildJoinSearch(sessionId) {
    const params = new URLSearchParams();
    params.set("sessionId", sessionId);
    return `?${params.toString()}`;
}
export function extractSessionIdFromJoinTarget(value) {
    const trimmed = value.trim();
    if (trimmed === "") {
        return null;
    }
    if (isValidSessionId(trimmed) && !containsUrlSyntax(trimmed)) {
        return trimmed;
    }
    const parsedUrl = parseJoinUrl(trimmed);
    if (parsedUrl === null) {
        return null;
    }
    const sessionId = parsedUrl.searchParams.get("sessionId")?.trim() ?? "";
    return isValidSessionId(sessionId) ? sessionId : null;
}
export function resolveSessionIdFromSearch(search) {
    const sessionId = new URLSearchParams(search).get("sessionId")?.trim() ?? "";
    if (sessionId === "") {
        return {
            error: null,
            sessionId: "",
        };
    }
    if (!isValidSessionId(sessionId)) {
        return {
            error: "The join link is invalid. Ask the host for a fresh session link.",
            sessionId: "",
        };
    }
    return {
        error: null,
        sessionId,
    };
}
function containsUrlSyntax(value) {
    return value.includes("://") || value.includes("?") || value.includes("/");
}
function isValidSessionId(value) {
    return SESSION_ID_PATTERN.test(value);
}
function parseJoinUrl(value) {
    try {
        if (/^https?:\/\//i.test(value)) {
            return new URL(value);
        }
        if (value.startsWith("/?") || value.startsWith("?")) {
            return new URL(value, "https://relay.invalid");
        }
        return null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=join-session.js.map