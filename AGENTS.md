# AGENTS

## Projektziel

- Local Multiplayer Game Hub fuer Windows-Host, Mobile-Browser-Clients und Public Relay.

## Architektur kurz

- Der Host ist autoritativ und trifft die verbindlichen Spielentscheidungen.
- Das Relay routet WebSocket-Messages zwischen Host und Clients.
- Plugins liefern Game-Logik und UI fuer einzelne Spiele.

## Qualitaetsregeln

- TypeScript strict ist Pflicht.
- Kein `any` ohne dokumentierte Begruendung.
- Die Game-Loop muss deterministisch sein.
- Errors muessen sauber behandelt und nachvollziehbar sein.

## Definition of Done

1. Build laeuft.
2. Tests und Lint laufen.
3. README ist aktualisiert.
4. Der Diff bleibt minimal.

## Dev-Kommandos

- `pnpm dev`
- `pnpm test`
- `pnpm lint`

## Logging Policy

- Jeder Disconnect und jeder Reconnect wird geloggt.
- Jedes `start game` und jedes `stop game` wird geloggt.
- Jeder Plugin-Load wird geloggt.
