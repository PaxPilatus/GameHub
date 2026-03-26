# Party-RPG Plugin — Verbindliche Spezifikation

Dieses Dokument fasst den Umsetzungsvertrag fuer `@game-hub/party-rpg` und die hostseitige AI-Schicht zusammen. Es ergaenzt [Architecture Overview](architecture-overview.md) und [Dev Guide](dev-guide.md).

## 1. Architektur-Fit und Annahmen

- Es gibt **einen** broadcasteten `gameState` fuer alle Clients; **kein** per-player Private-Channel im Protokoll.
- `party-rpg` ist **first-party** (Trust-/Loader-Listen im Host und Mobile).
- OpenRouter und API-Keys laufen **nur** im Host-Prozess (`apps/host`); Plugin-UI-Bundles rufen keine APIs mit Secrets auf.
- Implementierung: `@game-hub/ai-gateway` (shared Package), instanziiert im Host beim Plugin-Load.

## 2. Oeffentlicher vs. host-interner State

### Broadcast-sicher (`PartyRpgState` in `plugins/party-rpg/src/reducer.ts`)

- Stage, Timer-/Deadline-Felder, Rundenindex, Spielerzeilen (ohne rohe Antworten).
- Charaktere: Anzeigename, Archetyp, Slogan, Kurzsummary, Emoji/Placeholder-Portrait, `assetStatus`, `voiceProfileId` (`player_voice_a` | `player_voice_b`, nur TTS).
- Aktuelle Situation: `id`, `title`, `prompt`, `tags` (aus kuratiertem JSON).
- Showcase: fixierte Reihenfolge, aktueller Index, **nur** freigegebene Eintraege (Narration als Segmenttexte + zusammengefasster Anzeigetext, `ttsReady`, Judge-Kurzkommentar).
- Pipeline-Metadaten (ohne Prompts/Audio-Blobs): `narrationStatusByPlayerId`, `ttsStatusByPlayerId`, `judgePipelineStatus` fuer UI/Monitoring.
- Rundenergebnis / Matcherergebnis: Winner-Id, Punkte, Platzhalter-Messages.

### Nicht im `gameState`

- Rohe Rundenantworten vor Reveal.
- Character-Entwuerfe im Rohformat.
- Prompt-Templates, Systemprompts, Request-IDs, Retry-Payloads.
- API-Keys, vollstaendige LLM-Rohtexte vor Validierung.

### Host-only Runtime (Modulscope in `plugins/party-rpg/src/index.tsx`)

- Private Antworten und Drafts, AI-Job-Status, Idempotenz-Ledger, Epochen (`gameEpoch`/`roundEpoch`) zum Verwerfen veralteter Async-Commits.

## 3. Stage-Maschine und Transitionen

Reihenfolge (ohne Sonderfaelle):

`lobby` → `character_creation` → `asset_generation` → `round_intro` → `answer_collection` → `llm_enrichment` → `showcase` → `judge_deliberation` → `round_result` → (`round_intro` bei weiterer Runde | `match_result` nach letzter Runde) → optional `restart` → Einstieg erneut in `character_creation`.

| Stage | Typische Transition | Timeout/Fallback |
| --- | --- | --- |
| lobby | Host startet Spiel | — |
| character_creation | alle ready / Host-Force | Deadline → Auto-Lock mit Defaults |
| asset_generation | alle Jobs fertig oder Fallback | Zeitlimit → Platzhalter-Summary/Emoji |
| round_intro | Timer / `skip_intro` | Auto-Weiter |
| answer_collection | alle Antworten oder Deadline | Fehlende → templated „keine Antwort“ |
| llm_enrichment | Alle Spieler-`NarrationScript`s bereit → Showcase | LLM/TTS-Fehler → begrenzte Retries + Fallbacks; Judge kann bereits parallel laufen; TTS-MVP = Stub |
| showcase | letzter Reveal / `next_reveal` | Schritt-Timer |
| judge_deliberation | Winner fest (LLM + Validierung) | Fallback-Winner-Regel |
| round_result | `continue_to_next_round` | Timer optional |
| match_result | `restart` | Hub-Placement |

Konkrete Konstanten und Logik: `plugins/party-rpg/src/reducer.ts`.

## 4. Actions (Vertrag)

Alle Actions sind stage-gegated; Spieler duerfen nur eigene `playerId` schreiben.

| Action | Erlaubte Stage | Sender | Idempotenz |
| --- | --- | --- | --- |
| `submit_character_profile` | character_creation | player (eigene Id) | Replay = Update bis Lock |
| `confirm_character_ready` | character_creation | player | einmal Lock |
| `submit_round_answer` | answer_collection | player | optional `clientRequestId`; eine aktive Antwort |
| `continue_to_next_round` | round_result | moderator/host | — |
| `restart` | match_result (und Host-Restart-Pfad) | host/moderator | `gameEpoch++`, Jobs verworfen |
| `skip_intro` | round_intro | host | — |
| `next_reveal` | showcase | host | Index++ |

## 5. AI-Gateway (OpenRouter)

- Package: `packages/ai-gateway` — HTTP-Client mit Timeout, begrenzte Retries, **kein** Log von Authorization oder Roh-Prompts.
- Env (nur Host): `OPENROUTER_API_KEY` (Pflicht fuer echte Calls), optional `OPENROUTER_MODEL`, `OPENROUTER_HTTP_REFERER`, `OPENROUTER_HTTP_TITLE`.
- Aufgaben: Character-Summary, Rundennarration, Judge (strukturiertes JSON + Zod-Validierung).
- Stale-Guard: Commits nur wenn Plugin-Epoche/Runde noch passt (siehe Host-Plugin-Handler).

## 6. Mobile vs. Central UX

- **Character:** Mobile = Formular + Ready; Central = Fortschritt x/y, keine privaten Texte.
- **Antworten:** Mobile = privates Feld + Countdown; Central = nur Anzahl/metainfo.
- **LLM-Phase:** Warteanimation; keine Secrets.
- **Showcase/Judge:** Mobile = eigener Status; Central = volle Show (Texte nacheinander).
- **Ergebnisse:** Mobile = eigener Score; Central = Winner-Callout, Gesamtwertung.

## 7. Repo- und Modulplan

| Bereich | Pfade |
| --- | --- |
| Plugin | `plugins/party-rpg/src/index.tsx`, `reducer.ts`, `mobile.tsx`, `central.tsx`, `situations.json` |
| AI (shared) | `packages/ai-gateway/src/*.ts` |
| Trust/Loader | `apps/host/src/plugin-registry.ts`, `apps/host/renderer/src/plugin-loader.ts`, `apps/mobile/src/plugin-loader.ts` |
| Vitest-Alias | `vitest.config.mts` → `@game-hub/party-rpg` → Quelle (Tests ohne vorab `dist`) |

Relay-Protokoll und `packages/protocol` Wire-Format: **MVP unveraendert**.

## 8. Fehler, Fallback, Reconnect

- **Portrait/Summary:** Retry begrenzt → Emoji/Template-Text; Runde laeuft weiter.
- **Narration/Judge:** JSON ungueltig → sanitisierte Antwort + deterministischer Winner nach Rubrik.
- **Reconnect:** Öffentlicher Stand reicht fuer UI; private Antwort bis Deadline erneut einreichbar wenn erlaubt.
- **Restart:** Alle async AI-Jobs durch Epoche ungueltig; Runtime-Maps geleert.

## 9. Implementierungs-Phasen (Roadmap, Kurz)

0. Spez + Typen + Stage-Matrix (dieses Dokument + Reducer).
1. Vertikaler Slice ohne echte LLM (Dummy/Fallback).
2. Character-UX + Validierung.
3. AI Character-Assets (Gateway + Jobs).
4. Antworten + Reveal-Stabilisierung.
5. AI-Narration.
6. AI-Judge + Hub-Results (`recordPlayerWin`, Punkte, `recordPlacement`).
7. Polish (Pacing, optional TTS-Vorbereitung).
8. Hardening: Tests, Lint, kein Secret-Leak.

**DoD Gesamt:** `pnpm build`, `pnpm test`, `pnpm lint` gruen; README aktualisiert.

## 10. Bekanntes Risiko: `game_state`-Groesse

Der Host verwirft uebergrosse Broadcast-Payloads. Party-RPG mit langen Texten kann das Limit naehern — bei Bedarf Texte kuerzen oder Splitting im Plugin pruefen (Monitoring ueber Host-Diagnostics).
