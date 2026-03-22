const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;

export interface SessionIdResolution {
  error: string | null;
  sessionId: string;
}

export function buildJoinSearch(sessionId: string): string {
  const params = new URLSearchParams();
  params.set("sessionId", sessionId);
  return `?${params.toString()}`;
}

export function extractSessionIdFromJoinTarget(value: string): string | null {
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

export function resolveSessionIdFromSearch(search: string): SessionIdResolution {
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

function containsUrlSyntax(value: string): boolean {
  return value.includes("://") || value.includes("?") || value.includes("/");
}

function isValidSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value);
}

function parseJoinUrl(value: string): URL | null {
  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value);
    }

    if (value.startsWith("/?") || value.startsWith("?")) {
      return new URL(value, "https://relay.invalid");
    }

    return null;
  } catch {
    return null;
  }
}
