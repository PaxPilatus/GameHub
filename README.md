# Game Hub

MVP-Monorepo fuer einen lokalen Multiplayer Game Hub mit Windows-Host, Mobile-Browser-Clients, Public Relay und Plugin-basierten Spielen.

## Weiterfuehrende Doku

- [Architecture Overview](docs/architecture-overview.md): Systembild, Datenfluesse, Fensterrollen, Plugin-Lifecycle und Trust-Boundaries
- [Dev Guide](docs/dev-guide.md): Plugin-Workflow, wichtige Schnittstellen, Screen-Split, Ranking-Integration und Prompt Pack fuer Vibecoding
- [Party-RPG Spec](docs/party-rpg-spec.md): Stages, public/private State, Actions, AI-Gateway, UX-Split und Fallbacks

## Struktur

- `apps/relay`: Public Relay mit REST-Session-Create, WebSocket-Routing und Static-Serving fuer den Mobile-Client
- `apps/host`: Electron-Host-App mit Main Process, Plugin-Runtime, Renderer-UI und Diagnostics
- `apps/mobile`: React/Vite Mobile-Client fuer Join, Lobby, Reconnect und mobile Game-Inputs
- `packages/protocol`: Gemeinsames Nachrichtenmodell mit Zod-Validierung
- `packages/sdk`: Gemeinsame Plugin-Typen fuer Manifest, Server-Hooks, Host-API und React-UIs
- `plugins/debug`: Referenz-Plugin fuer Runtime- und UI-Wiring
- `plugins/trivia`: Referenzspiel mit 5 Runden, Reveal, Scoreboard und Teamwertung
- `plugins/snake`: Realtime-Referenzspiel mit autoritativem Tick, Lobby-Board, Countdown-Start, Mobile-HUD-Minimap und Canvas-Central-View
- `plugins/party-rpg`: Rundenbasiertes Party-Game mit Charakterphase, hostseitiger OpenRouter-Integration (`@game-hub/ai-gateway`), privat oeffentlicher State-Trennung und Hub-Results

## Dev Start

1. `corepack enable`
2. `corepack pnpm install`
3. `corepack pnpm dev`

`pnpm dev` startet den kompletten MVP-Stack parallel:

- TypeScript-Project-Reference-Watch fuer das Monorepo
- Vite Watch-Build fuer `apps/mobile`
- Vite Watch-Build fuer den Host-Renderer in `apps/host/renderer`
- Relay auf `http://127.0.0.1:8787/`
- Electron-Host-App gegen denselben Relay

Der Electron-Dev-Runner wartet fuer Start und Restart, bis die aktive Host-Runtime (`apps/host/bootstrap.cjs`, `preload.cjs` und die kompilierten Host-Module unter `apps/host/dist`) zusammen mit `dist/renderer/index.html` stabil vorhanden sind. Dadurch entstehen waehrend der initialen Watch-Builds keine mehrfachen Host-Sessions.

Der Mobile-Client wird direkt ueber den Relay unter `/` ausgeliefert.

Fuer oeffentliche Join-Links im Dev-Setup sind diese Umgebungsvariablen relevant:

- `RELAY_BASE_URL`: Basis-URL, ueber die der Host den Relay anspricht
- `RELAY_PUBLIC_BASE_URL`: oeffentliche URL, die der Relay in `joinUrl` fuer Handys rendert
- `RELAY_HOST`: Bind-Adresse des lokalen Relay-Prozesses, Standard `127.0.0.1`
- `RELAY_PORT`: Port des lokalen Relay-Prozesses, Standard `8787`
- `HOST_RATE_LIMIT_MAX_MESSAGES`: separates Host-Message-Budget fuer tick-basierte Spiele, Standard `600`
- `HOST_RATE_LIMIT_WINDOW_MS`: Zeitfenster fuer das Host-Rate-Limit, Standard `10000`
- `ALLOWED_WEB_ORIGINS`: komma-separierte Allowlist fuer Browser-WebSocket-Origins auf `/ws/mobile`
- `CREATE_SESSION_RATE_LIMIT_MAX_REQUESTS`: Limit fuer `POST /api/session/create` pro IP, Standard `20`
- `CREATE_SESSION_RATE_LIMIT_WINDOW_MS`: Zeitfenster fuer das Session-Create-Limit, Standard `60000`
- `HANDSHAKE_RATE_LIMIT_MAX_ATTEMPTS`: Limit fuer WebSocket-Handshakes pro IP, Standard `120`
- `HANDSHAKE_RATE_LIMIT_WINDOW_MS`: Zeitfenster fuer das Handshake-Limit, Standard `60000`
- `AUTH_FAILURE_RATE_LIMIT_MAX_ATTEMPTS`: Limit fuer wiederholte Join-/Reconnect-/Host-Auth-Fehler pro IP, Standard `20`
- `AUTH_FAILURE_RATE_LIMIT_WINDOW_MS`: Zeitfenster fuer das Auth-Fehler-Limit, Standard `60000`
- `ALLOW_UNTRUSTED_PLUGINS`: optionaler Override fuer nicht-first-party Plugins; Standard ist `false`
- **Party-RPG / OpenRouter (nur Host-Prozess):**
  - `OPENROUTER_API_KEY`: API-Key fuer KI-gestuetzte Texte (Charakterkurzfassung, Narration, Judge). Ohne Key nutzt das Plugin deterministische Fallbacks.
  - `OPENROUTER_MODEL`: optionales Modell (z. B. `openai/gpt-4o-mini`). Standard falls nicht gesetzt: sinnvoller Default im AI-Gateway.
  - `OPENROUTER_HTTP_REFERER` / `OPENROUTER_HTTP_TITLE`: optional fuer OpenRouter-Site-Header.
Beispiel mit Tunnel:

```powershell
$env:RELAY_PUBLIC_BASE_URL = "https://<dein-tunnel>.trycloudflare.com/"
corepack pnpm dev
```

## Host Start Ohne Dev Watch

1. `corepack pnpm build`
2. `corepack pnpm start:built`

Die Host-App erstellt beim Start automatisch eine neue Relay-Session, verbindet sich als Host und zeigt:

- Join-QR-Code fuer die Session-URL
- Lobby mit Spielern, Rollen und Teams
- Admin-Aktionen fuer Moderator, Game-Auswahl, Start, Stop, `Restart Game` und `Restart Session (New Code)`
- Central Plugin View aus dem aktuell geladenen Plugin plus ein separates Fullscreen-Central-Screen-Fenster beim Spielstart
- Compact Central-Header mit Session-Meta, Player-Topliste und einer scrollfreien Game-Buehne, die den restlichen Bildschirm fuer das aktive Spiel reserviert
- Diagnostics mit Connection-Status, Event-Stream und grober Latenzschaetzung


## Session und Restart Verhalten

- `Restart Game` behaelt `sessionId`, `joinUrl`, verbundene Spieler, Moderator und Relay-Verbindung bei.
- `Restart Game` initialisiert nur das aktuell ausgewaehlte Spiel neu und startet direkt eine frische Runde desselben Spiels.
- `Restart Session (New Code)` ist weiterhin der harte Reset: neue Session, neue Join-URL, neuer QR-Code.
- Waehrend der Host gerade eine Session erstellt, zum Relay verbindet oder sauber schliesst, ist `Restart Session (New Code)` bewusst kurz blockiert, damit keine doppelten Lifecycle-Races entstehen.
- Spielwechsel waehrend `game_running` ist absichtlich blockiert. Stoppe oder restarte zuerst die laufende Runde.
- Der Central Screen wird beim `Start Game` oder `Restart Game` automatisch in einem zweiten Electron-Fenster geoeffnet und auf Fullscreen gesetzt. Falls ein zweiter Monitor vorhanden ist, wird er bevorzugt dort geoeffnet.
- Der Admin-Host und der Central Screen koennen beide manuell auf Fullscreen umgeschaltet werden.

## Relay Betriebsgrenzen

- Der Relay bleibt in dieser Runde bewusst in-memory. Service-Restarts, Deploys oder Instanzwechsel terminieren laufende Sessions.
- Render Free bleibt fuer Tests unterstuetzt, aber die Realtime-Logik ist nicht speziell auf den Free-Plan verdrahtet.
- Fuer tick-basierte Spiele wie Snake gibt es ein separates Host-Rate-Limit, damit `game_state`-Broadcasts nicht mit denselben Grenzen wie Mobile-Traffic behandelt werden.

## Security Defaults

- Fuer oeffentliche Deployments sollte `PUBLIC_BASE_URL` immer gesetzt sein. Wenn es nicht gesetzt ist, erzeugt der Relay bewusst nur lokale/dev-sichere Join-Links aus der echten Listener-Adresse und ignoriert `Host`- sowie `X-Forwarded-*`-Header.
- Mobile-WebSockets auf `/ws/mobile` akzeptieren nur Origins aus derselben Relay-Origin oder aus `ALLOWED_WEB_ORIGINS`.
- Session-Erstellung, WebSocket-Handshakes und wiederholte Join-/Reconnect-Auth-Fehler werden separat pro IP limitiert.
- Reconnect-Tokens bleiben auf Relay- und Mobile-Seite; der Host-Renderer bekommt weder Player-Tokens noch rohe Secret-Felder in Snapshots oder Diagnostics.
- Statische Relay-Antworten setzen `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` und `frame-ancestors 'none'`.
- Der Host beschraenkt Broadcasts auf relay-sichere `game_state`-Payload-Groessen. Uebergrosse Plugin-States werden verworfen und als Diagnostic geloggt.

## Oeffentliche Relay-URL
- Fuer Handys im Mobilfunknetz brauchst du eine oeffentliche URL fuer den Relay. Der QR-Code ist nur die Session-URL als Bild.
- Das aktuelle Relay ist auf Root-Pfade ausgelegt: `/`, `/assets/*`, `/api/session/create`, `/ws/host` und `/ws/mobile`.
- Darum ist ein eigenes Subdomain-Setup wie `https://hub.example.com/` oder `https://play.example.com/` die saubere Standardloesung.
- Eine Unterseite wie `https://example.com/gamehub/` ist mit dem aktuellen Stand nicht plug-and-play, weil Mobile-Build und Relay-Routen nicht auf einen URL-Prefix umgestellt sind.
- Wenn du deine bestehende Website nutzen willst, richte dort am besten eine Subdomain ein, die per Reverse Proxy auf den Relay zeigt.

## Join URL

- Der Relay erzeugt Join-URLs im Muster `https://<relay-domain>/?sessionId=<id>`.
- Lokal ist das im Dev-Setup typischerweise `http://127.0.0.1:8787/?sessionId=<id>`.
- Die Host-App rendert aus genau dieser URL den QR-Code fuer Mobile-Clients.
- Der Mobile-Client liest `sessionId` aus der Query-String-URL und verbindet sich anschliessend via `/ws/mobile` mit derselben Session.

## Mobile Reconnect

- Nach einem erfolgreichen `hello_ack` speichert `apps/mobile` den `playerToken` in einem versionierten, session-spezifischen Reconnect-Record im Browser-Storage. Der Record enthaelt auch `savedAt` und `expiresAt`, damit alte Tokens automatisch verworfen werden.
- Beim Reload sendet der Client, falls vorhanden, denselben `playerToken` erneut im `hello` an den Relay.
- Der Relay ordnet dadurch denselben `playerId` wieder zu und liefert `hello_ack.reconnect = true` zurueck.
- Snake nutzt diesen Flow waehrend `game_running` fuer einen Respawn auf einem sicheren Spawn-Slot.
- Falls der Token ungueltig oder die Session abgelaufen ist, wird der Token verworfen und der Client faellt auf den normalen Join-Flow zurueck.

## Plugin Runtime

- Der Host scannt `plugins/*`, laedt standardmaessig aber nur explizit vertraute First-Party-Plugins (`debug`, `snake`, `trivia`, `party-rpg`). Weitere Plugins werden nur mit `ALLOW_UNTRUSTED_PLUGINS=true` zugelassen.
- Geladene Plugins laufen im Host-Prozess und erhalten `GameHostApi`-Hooks fuer `onSessionCreated`, `onPlayerJoin`, `onPlayerLeave`, `onPlayerReconnect`, `onGameStart`, `onGameStop`, `onInput` und optional `onTick`.
- Wenn ein Plugin `manifest.tickHz` setzt und `onTick` exportiert, startet der Host dafuer automatisch einen autoritativen Interval-Loop mit `1000 / tickHz` Millisekunden pro Tick.
- `apps/mobile` mountet die mobile React-Komponente per dynamischer Import-Map auf Basis von `pluginId`.
- Der Host-Renderer mountet die zentrale React-Komponente desselben Plugins ebenfalls per dynamischer Import-Map.
- `plugins/debug` ist das kleinste Referenzspiel: ein Counter-State mit Increment-Button und Tick-Loop.
- `plugins/trivia` trennt Host-Serverlogik vom Mobile-/Central-UI-Entry, damit Fragen mit korrekten Antworten nur im Host-Bundle landen.

## Trivia Referenzspiel

`plugins/trivia` ist das erste echte Referenzspiel. Der Ablauf ist bewusst klein gehalten:

- Host startet das Spiel aus der Lobby.
- Es werden genau 5 Fragen aus `plugins/trivia/src/questions.json` nacheinander gespielt.
- Jede Runde hat 4 Antworten, ein Timer laeuft ueber `onTick`, und nach Timeout oder sobald alle verbundenen Spieler geantwortet haben folgt die Reveal-Phase.
- Nach der fuenften Reveal-Phase wechselt das Plugin auf den Result-Screen.
- Der Host kann ueber die zentrale Plugin-UI mit dem Input `restart` sofort neu starten.

### Trivia Inputs

- `answer`: Mobile-Input mit `value` als `string` fuer die gewaehlte Option-ID, zum Beispiel `"a"` oder `"d"`
- `restart`: Host-Action ohne Payload. Setzt Scoreboard, Timer und Fragenfolge auf Runde 1 zurueck.

### Trivia Broadcast State

`plugins/trivia` broadcastet im `game_state.state.gameState` diese oeffentliche Form:

- `stage`: `lobby | question | reveal | results`
- `questionNumber`: aktuelle 1-basierte Fragennummer, im Result-Screen `5`
- `totalQuestions`: Anzahl aktiver Fragen, im MVP `5`
- `secondsRemaining`: verbleibender Countdown fuer Frage oder Reveal
- `answerCount`: Anzahl bisher eingegangener Antworten in der aktuellen Runde
- `totalEligibleAnswers`: Anzahl aktuell verbundener Spieler, die fuer die Runde zaehlen
- `answeredPlayerIds`: Liste der Player-IDs, die fuer die aktuelle Runde bereits geantwortet haben
- `currentQuestion`: `{ id, prompt, options[] }` ohne korrekte Antwort, solange die Runde offen ist
- `lastRoundSummary`: nach Reveal/Results die letzte ausgewertete Frage mit `correctOptionId`, `correctOptionLabel` und Antwortverteilung
- `scores`: Spieler-Scoreboard mit `playerId`, `name`, `team`, `connected`, `score`
- `teamScores`: aggregierte Teamwertung fuer Team `A` und `B`
- `supportsTeams`: `true` fuer Trivia
- `latestMessage`: kurze Textzeile fuer UI-Status

## Snake Referenzspiel

`plugins/snake` ist das Realtime-Referenzspiel fuer tick-basierte Plugins.

- Grid: dynamische Round-Presets von `28 x 18` fuer 2 Spieler bis `72 x 40` fuer 12 Spieler; die Round-Map wird beim Start eingefroren
- Tick-Rate: `12 Hz` ueber `manifest.tickHz`
- Der Host ist autoritativ und verarbeitet pro Player die zuletzt eingegangene Richtungs-Eingabe vor dem naechsten Tick.
- Bereits in der Snake-Lobby werden alle verbundenen Spieler direkt auf dem Brett platziert und mit Name plus Farbe angezeigt.
- Beim Start beginnt die Runde ueber einen synchronen Countdown `3 -> 2 -> 1 -> GO`.
- Mode `standard`: zeitbasierte Runde mit `180s`, Sieger via Top-Score.
- Mode `coinrush`: zeitbasierte Runde mit `120s`, Sieger ausschliesslich via `coinCount`; Food/Items/Respawn bleiben aktiv.
- Die Mapgroesse und das aktive Round-Roster werden beim Start eingefroren; neue Joins waehrend `countdown`, `running` oder `game_over` zaehlen erst fuer die naechste Runde.
- Namen bleiben nur in `lobby` und `countdown` sichtbar; waehrend `running` verschwindet das Labeling wieder fuer ein klares Spielfeld.
- Movement nutzt Wrap-around statt Wandtod.
- Food gibt immer `+1` Score und `+1` Laenge; Death-Drops werden bei Elimination als eigenes Drop-Food verteilt.
- Respawn laeuft automatisch nach `2.5s`, mit `1.0s` Spawn-Schutz; geschuetzte Snakes koennen keine anderen Snakes toeten und werden durch Snake-Kollisionen nicht getoetet (Self-Collision bleibt toedlich).
- Kill-Score gibt `+3` nur bei eindeutiger Fremdkoerper-Kollision (klarer Abschneide-Fall).
- Coinrush spawnt Coins in Hotspot-Wellen (`announce` -> `active`) mit normal/gold Coins (`+1`/`+3`).
- Optionales Event `Secret Quests`: pro Spieler genau 1 geheime Quest pro Runde, einmaliger Reward `+8 Score`; Reveal nur in `game_over`.
- Die Runde endet bei Time-up; Gleichstand ist Draw.

### Snake Inputs

- `direction`: Mobile-Input mit Payload `{ "dir": "up" | "down" | "left" | "right" }`; kann waehrend des Countdowns bereits fuer den ersten Live-Turn vorgemerkt werden
- `action`: reservierter Mobile-Input mit Payload `{ "type": "boost" }`; weiterhin optional, Kern-Gameplay laeuft ueber Tick-State
- `snake_items_config`: Host-Action mit partieller Payload `{ boost?: boolean, magnet?: boolean, shield?: boolean }`; nur in `lobby` und `countdown` wirksam, fuer `running` eingefroren
- `snake_mode_config`: Host-Action mit Payload `{ mode: "standard" | "coinrush" }`; nur in `lobby` und `countdown` wirksam, fuer `running` eingefroren
- `snake_secret_quests_config`: Host-Action mit Payload `{ enabled: boolean }`; nur in `lobby` und `countdown` wirksam, fuer `running` eingefroren
- `restart`: Host-Action ohne Payload. Startet aus dem Central-Screen sofort eine neue Runde.

### Snake Broadcast State

`plugins/snake` broadcastet im `game_state.state.gameState` diese oeffentliche Form:

- `stage`: `lobby | countdown | running | game_over`
- `tickHz`: konfigurierte Tick-Frequenz aus dem Manifest
- `tick`: aktuelle Tick-Nummer innerhalb der laufenden Runde
- `aliveCount`: Anzahl aktuell lebender Snakes
- `countdownRemaining`: `3`, `2`, `1`, `0` fuer `GO!` oder `null`, sobald kein Countdown aktiv ist
- `showIdentityLabels`: `true` in `lobby` und `countdown`, sonst `false`
- `roundMode`: `standard | coinrush` (laufende/vorbereitete Runde)
- `roundSecondsRemaining`: verbleibende Sekunden in der laufenden Runde oder `null`
- `winnerPlayerId`: Gewinner der letzten Runde oder `null`
- `winnerTeam`: Team des Gewinners oder `null`
- `latestMessage`: kurze Statuszeile fuer Mobile- und Central-UI
- `grid`: `{ width, height }`
- `foods`: Liste mit `{ point, source }`, wobei `source` entweder `normal` oder `drop` ist
- `items`: Liste mit `{ point, type }`, wobei `type` `boost | magnet | shield` ist
- `coins`: Liste mit `{ point, type, value }`, wobei `type` `normal | gold` ist
- `itemSettings`: aktive Lobby-/Countdown-Toggles `{ boost, magnet, shield }`
- `secretQuestSettings`: Lobby-/Countdown-Toggle `{ enabled }`, in `running` eingefroren
- `secretQuestRoundSummary`: nur in `game_over` gesetzt, sonst `null`; Liste `{ playerId, questType, completed, bonusAwarded }` pro Spieler mit zugewiesener Quest
- `coinrush`: `null` ausserhalb Coinrush, sonst Wave-/Hotspot-Status `{ phase, phaseTicksRemaining, wave, announcedHotspots[], activeHotspots[] }`
- `snakes`: Liste aller bekannten Spieler mit `playerId`, `name`, `team`, `connected`, `alive`, `direction`, `head`, `segments[]`, `color`, `score`, `coinCount`, `respawnTicksRemaining`, `spawnProtectionTicksRemaining`, `activeEffects[]`, `speedBank` und `wins`

## Party-RPG (`party-rpg`)

Turn-basiertes Party-Game: Charaktererstellung, kuratierte Situationen, private Antworten (nur host-intern bis zum Reveal), AI-Narration und Judge, Anbindung ans Hub-Ranking.

- **Charakterphase:** Mobile-Client nutzt einen 5-Schritte-Wizard (Content-Registry, Comedy-Stil-Radar, Name/Slogan-Vorschläge). Profilsenden erfolgt per `submit_character_profile` mit optionalem `confirmReady: true` (Host wendet Speichern und Bereit in einem Schritt an); der separate Action `confirm_character_ready` bleibt kompatibel. Wizard-Zwischenstand kann pro Spieler in `sessionStorage` liegen und wird bei Abschluss oder Stage-Wechsel gelöscht.
- **Doku:** [docs/party-rpg-spec.md](docs/party-rpg-spec.md) (Stages, Actions, Trust-Grenzen, Fallbacks).
- **Module:** `plugins/party-rpg`, KI-Client: `packages/ai-gateway` (vom Host eingebunden).
- **Broadcast-State:** Keine rohen Spielerantworten vor dem Showcase; nur freigegebene Texte und Metriken.

## Neues Plugin Anlegen

Lege einen neuen Ordner unter `plugins/<your-plugin-id>` an mit dieser Minimalstruktur:

```text
plugins/<your-plugin-id>/
  package.json
  tsconfig.json
  src/
    index.tsx
```

Das Plugin exportiert aus `src/index.tsx` mindestens:

- `gamePlugin`
- `manifest`
- `default` als dasselbe `gamePlugin`

Das Standardmuster sieht so aus:

```tsx
import type { GameCentralProps, GameMobileProps } from "@game-hub/sdk";
import { createGamePlugin } from "@game-hub/sdk";

interface MyState extends Record<string, unknown> {
  counter: number;
}

function MobileView(props: GameMobileProps<MyState>) {
  return <button onClick={() => props.sendInput("increment", 1)}>Increment</button>;
}

function CentralView(props: GameCentralProps<MyState>) {
  return <div>{props.gameState?.counter ?? 0}</div>;
}

export const gamePlugin = createGamePlugin<MyState, number>({
  manifest: {
    displayName: "My Game",
    id: "my-game",
    supportsTeams: false,
    tickHz: 10,
    version: "0.1.0",
  },
  createInitialState() {
    return { counter: 0 };
  },
  parseInput(message) {
    return typeof message.value === "number" ? message.value : undefined;
  },
  server: {
    onInput(api, input) {
      if (input.action !== "increment") {
        return;
      }

      api.updateState((state) => ({
        ...state,
        counter: state.counter + (input.payload ?? 1),
      }));
    },
    onTick(api) {
      api.updateState((state) => ({
        ...state,
        counter: state.counter + 1,
      }));
    },
  },
  mobile: MobileView,
  central: CentralView,
});

export const manifest = gamePlugin.manifest;
export default gamePlugin;
```

Pflicht fuer ein neues Plugin:

- eindeutige `manifest.id`
- `createInitialState()` fuer den Host-State
- `server` mit den benoetigten Hooks
- `mobile` React-Komponente
- `central` React-Komponente
- fuer tick-basierte Spiele optional `manifest.tickHz` plus `server.onTick`

## Tick-basierte Spiele

Fuer Realtime-Spiele wie Snake setzt du die Tick-Frequenz direkt im Manifest, zum Beispiel `tickHz: 12`. Der Host startet dann automatisch den Intervall fuer `onTick`.

Praktisches Muster fuer neue Realtime-Plugins:

- halte den eigentlichen Game-State in einem reinen Reducer, damit Ticks und Inputs deterministisch bleiben
- sammle Inputs zwischen zwei Ticks und wende pro Tick nur den letzten gueltigen Input je Player an
- broadcast nur oeffentlichen State ueber `api.setState(...)`; Host-interne Queues oder Geheimnisse bleiben ausserhalb des Broadcast-States
- nutze `onPlayerReconnect`, wenn Realtime-Spiele waehrend einer laufenden Runde einen Respawn oder Spectator-Fallback brauchen

## Weitere Kommandos

- `corepack pnpm build`
- `corepack pnpm test`
- `corepack pnpm lint`

`pnpm build` erzeugt die TypeScript-Artefakte sowie die Vite-Builds fuer `apps/mobile/dist` und `apps/host/dist/renderer`.
















