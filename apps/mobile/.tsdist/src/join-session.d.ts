export interface SessionIdResolution {
    error: string | null;
    sessionId: string;
}
export declare function buildJoinSearch(sessionId: string): string;
export declare function extractSessionIdFromJoinTarget(value: string): string | null;
export declare function resolveSessionIdFromSearch(search: string): SessionIdResolution;
//# sourceMappingURL=join-session.d.ts.map