# Game Hub Dev Guide

## Ziel

Dieses Dokument zeigt, wie du neue Spiele fuer Game Hub **schnell, sauber und vibecore-freundlich** als Plugins baust, ohne Sessionmanagement, Lobby, Ranking, QR-Join oder Windowing selbst neu zu implementieren.

## Schnellstart fuer Plugin-Entwickler

### Voraussetzungen

- Node + pnpm im Monorepo
- laufender Dev-Stack ueber `corepack pnpm dev`
- Grundverstaendnis fuer React + TypeScript

### Relevante Kommandos

```powershell
corepack pnpm dev
corepack pnpm build
corepack pnpm test
corepack pnpm lint
```

### Was du zuerst lesen solltest

1. `docs/architecture-overview.md`
2. `packages/sdk/src/index.ts`
3. `packages/protocol/src/messages.ts`
4. `plugins/debug`
5. `plugins/trivia` oder `plugins/snake` je nach Spieltyp

## Mentales Modell fuer neue Spiele

### Was der Hub fuer dich uebernimmt

- Session-Erstellung und Join-Flow
- QR-Code / Join-URL
- Player Identity und Reconnect
- Lobby
- Moderator / Admin-Flow
- hostseitige Start-/Stop-/Restart-Steuerung
- session-lokales Ranking
- Central Window und Admin Window
- Mobile-App-Loading
- Broadcast von `hubState` + `gameState`

### Was dein Plugin liefern muss

- `manifest`
- `createInitialState()`
- `server`-Hooks
- `ui.mobile`
- `ui.central`
- optional `parseInput`
- optional `controls`
- optional `onTick` mit `manifest.tickHz`

### Faustregel

Wenn du dich fragst “muss mein Spiel auch Join, Session, Lobby oder Ranking machen?”, lautet die Antwort fast immer: **nein, der Hub soll das tun**.

## Plugin-Minimalstruktur

```text
plugins/<your-plugin-id>/
  package.json
  tsconfig.json
  src/
    index.tsx
```

Minimaler Export:

- `gamePlugin`
- `manifest`
- `default`

Ein kleines Startmuster:

```tsx
import type { GameCentralProps, GameMobileProps } from "@game-hub/sdk";
import { createGamePlugin } from "@game-hub/sdk";

interface MyState extends Record<string, unknown> {
  counter: number;
}

function MobileView(props: GameMobileProps<MyState>) {
  return (
    <button onClick={() => props.sendInput("increment", 1)}>
      Increment
    </button>
  );
}

function CentralView(props: GameCentralProps<MyState>) {
  return <div>{props.gameState?.counter ?? 0}</div>;
}

export const gamePlugin = createGamePlugin<MyState, number>({
  manifest: {
    displayName: "My Game",
    id: "my-game",
    supportsTeams: false,
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
  },
  mobile: MobileView,
  central: CentralView,
});

export const manifest = gamePlugin.manifest;
export default gamePlugin;
```

## Kernschnittstellen fuer neue Spiele

### `createGamePlugin`

Nimmt dein Plugin-Objekt und normalisiert es auf den Game-Hub-Vertrag.

Nutzen:

- saubere Manifest-Defaults
- einheitliche `ui`-Struktur
- kompatibler Plugin-Export

### `GamePluginDefinition`

Das ist der eigentliche Vertrag zwischen deinem Spiel und dem Host.

Er umfasst:

- `manifest`
- `createInitialState`
- optional `parseInput`
- `server`
- `ui`
- optional `controls`

Faustregel:

- Wenn du ein neues Spiel baust, denk in einer `GamePluginDefinition`
- Wenn du nur einen Screen oder Reducer baust, verlier nicht aus dem Blick, wie er in diesen Gesamtvertrag passt

### `GameManifest`

Hier beschreibst du, was dein Spiel grundsaetzlich ist.

Wichtige Felder:

- `id`: eindeutige Plugin-ID
- `displayName`: sichtbarer Name im Host
- `version`
- `supportsTeams`
- `tickHz`: fuer Realtime-Spiele
- optional `inputMode`, `rankingMode`, `uiSlots`

### `GameControlSchema`

Damit beschreibst du einfache, hub-eigene Mobile-Controls deklarativ.

Typische Einsaetze:

- D-Pad fuer Realtime-Games
- Aktionsbuttons
- Auswahl- oder Voting-Flaechen

Wann es passt:

- wenn dein Spiel mit standardisierten Controls gut spielbar ist
- wenn du schnell einen ersten MVP willst

Wann du besser `ui.mobile` ausbauen solltest:

- wenn der Spieler einen persoenlichen HUD braucht
- wenn du private Informationen oder komplexe Ablaufe zeigen willst
- wenn du Orientation, Minimap, Countdown oder persoenliche States sauber abbilden musst

### `GameHostApi`

Das ist deine wichtigste Server-seitige Schnittstelle.

Wichtige Bereiche:

#### State

- `getState()`
- `setState(nextState)`
- `updateState(fn)`
- `state.get/set/update`

Verwende das fuer deinen **oeffentlichen Spielzustand**.

#### Session

- `getPlayers()`
- `getSnapshot()`
- `session.getPlayers()`
- `session.getLeaderboard()`
- `session.setPlayerStatus(...)`

Verwende das fuer Spielerbezug und Hub-Meta.

#### Results

- `recordPlayerWin`
- `awardPlayerPoints`
- `awardTeamPoints`
- `setPlayerScore`
- `setPlayerStatus`
- `recordPlacement`
- `endRound`
- `endMatch`

Verwende das, wenn der Hub etwas ueber Score, Sieg, Status oder Ergebnis wissen muss.

#### UI

- `ui.publishStatusBadges(...)`
- `ui.setOverlay(...)`
- `ui.clearOverlay()`

Verwende das fuer hub-weite Shell-Infos.

#### Log

- `log(level, type, message, data?)`

Verwende das fuer nachvollziehbare Diagnostik.

### `GameMobileProps`

Fuer persoenliche Spieleroberflaechen.

Wichtige Props:

- `gameState`
- `hubSession`
- `phase`
- `players`
- `playerId`
- `role`
- `sendInput(action, payload?)`

### `GameCentralProps`

Fuer die gemeinsame Buehne.

Wichtige Props:

- `gameState`
- `hubSession`
- `phase`
- `players`
- `invokeHostAction(action, payload?)`

Wichtig: `invokeHostAction` ist fuer hostseitige Steueraktionen gedacht, nicht fuer normale Spieler-Inputs.

### `hubSession` vs `gameState`

Merke dir diese Trennung:

- `hubSession`: Session, Ranking, Lifecycle, Overlay, Badges, Join-Meta
- `gameState`: dein spiel-spezifischer, oeffentlicher Zustand

Anti-Pattern:

- Session-Ranking komplett im `gameState` verstecken
- host-interne Geheimnisse im `gameState` broadcasten

## Wie man den Game State modelliert

### Was in `gameState` gehoert

- aktuelle Stage deines Spiels
- Spielwelt / Frage / Grid / Runde / Timer
- oeffentliche Spielerwerte
- alles, was Central und Mobile sehen duerfen

### Was nicht in `gameState` gehoert

- rohe Tokens
- host-interne Queues oder Debug-Objekte
- private Antworten, die nicht fuer alle sichtbar sein sollen
- anything, das nicht broadcastet werden soll

### Empfehlung fuer Realtime-Spiele

- baue einen **reinen Reducer**
- sammle Inputs
- wende pro Tick deterministisch an
- halte Nebenwirkungen aus dem Reducer heraus

### Empfehlung fuer turn-based Spiele

- modellier Stages explizit, z. B. `lobby | question | reveal | results`
- halte Timer und Ergebniswechsel hostseitig in den Hooks

## Mobile Screen vs Central Screen

## Grundregel

- **Central Screen** ist die gemeinsame Show fuer alle.
- **Mobile Screen** ist der persoenliche Interaktions- und Orientierungskanal.

### Central Screen: was hier gut hinpasst

- gemeinsames Spielfeld
- grosse Visualisierung
- Countdown
- oeffentliche Resultate
- TV-/Beamer-lesbare States

### Central Screen: was hier nicht hinpasst

- private Auswahl vor Reveal
- persoenliche Secrets
- UI, die nur fuer einen Spieler sinnvoll ist

### Mobile Screen: was hier gut hinpasst

- Buttons, D-Pad, Aktionen
- persoenliche Hinweise
- private Antwortauswahl
- Minimap / Personal HUD
- "Du bist Spieler X / Team Y"

### Typische UI-Muster

- D-Pad / Action Buttons
- Voting / Antwortauswahl
- private Buzzer-/Reaction-UI
- personal HUD
- Countdown / Ready Screen
- Round Result / "Wait for host"
- selection grid
- compact minimap

### Praktische Entscheidungshilfe

Wenn eine Information **alle gleichzeitig** sehen sollen, gehoert sie eher auf den Central Screen.

Wenn eine Information **nur dem einzelnen Spieler** hilft, gehoert sie eher aufs Handy.

## Ranking und Ergebnisse richtig integrieren

### Wann `recordPlayerWin`

Wenn dein Spiel einen klaren Rundensieger hat.

Beispiel:

- Snake-Rundensieg
- Minigame mit genau einem Gewinner

### Wann `awardPlayerPoints`

Wenn Spieler fortlaufend Punkte sammeln.

Beispiel:

- Quiz
- Rhythmus-/Geschicklichkeitsspiel

### Wann `setPlayerStatus`

Wenn der Hub den Spielerzustand sichtbar machen soll.

Beispiele:

- `alive`
- `dead`
- `waiting`
- `winner`
- `offline`

### Wann `endRound` / `endMatch`

- `endRound`: eine Runde ist vorbei, Spiel kann weitergehen
- `endMatch`: kompletter Match oder kompletter Fragenblock ist beendet

### Anti-Pattern

- nur plugin-internes Scoreboard ohne `results`
- doppelte Ranglogik im Plugin und im Hub
- Gewinner nur als Textmessage statt als strukturierter Result-Event

## Beispiel-Workflows

### 1. Einfaches Party Game

Empfehlung:

- kein Tick
- wenige Inputs
- `onInput` treibt fast alles
- Mobile: Buttons
- Central: Status + gemeinsame Show

### 2. Trivia / Quiz

Empfehlung:

- klare Stage-Maschine
- private Mobile-Antworten
- Central zeigt Frage und Reveal
- Ranking ueber `awardPlayerPoints` / `setPlayerScore`

### 3. Tick-basiertes Realtime-Game

Empfehlung:

- Reducer
- `manifest.tickHz`
- `onTick`
- Input-Queueing
- deterministische Updates
- Mobile eher als HUD + Controls
- Central als primaere Buehne

## Integrations-Checkliste vor dem ersten Lauf

- `manifest.id` eindeutig
- `createInitialState()` stabil und klein
- `parseInput()` validiert Eingaben sauber
- `mobile` UI vorhanden
- `central` UI vorhanden
- `gameState` enthaelt nur oeffentliche Daten
- `results`-Events sind integriert
- `Restart Game` ergibt einen sauberen Reset
- Reconnect-Verhalten ist bewusst definiert
- Testfaelle fuer Join, Restart und Fehlerpfade sind notiert

## Test- und QA-Leitfaden

### Mindestens lokal pruefen

- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm lint`

### Manuell pruefen

- zwei Geraete joinen dieselbe Session
- Start / Stop / Restart Game
- Restart Session
- Central Screen und Mobile Screen sind synchron
- invalid input fuehrt nicht zum Crash
- Reconnect funktioniert erwartungsgemaess
- `gameState`-Shape bleibt ueber Stages stabil

### Fuer Realtime-Spiele zusaetzlich

- Input-Ordering
- Tick-Stabilitaet
- Disconnect / Reconnect mitten in der Runde
- Verhalten bei mehreren schnellen Inputs pro Tick

## Prompt Pack fuer Vibecoding

Die folgenden Prompts sind dafuer gedacht, dass du einem Coding-Modell direkt den richtigen Kontext fuer Game Hub gibst.

Gib einem Modell moeglichst immer diese Basisinfos mit:

- Spielidee in 5-10 klaren Regeln
- Ziel: turn-based oder realtime
- Anzahl Spieler, Teams ja/nein
- was oeffentlich und was privat ist
- wie Sieg, Punkte oder Eliminierung funktionieren
- ob Countdown, Restart Game und Reconnect relevant sind

Erwarte vom Modell nicht nur UI-Code, sondern immer auch:

- State-Modell
- Hook-/Runtime-Plan
- Mobile-vs-Central-Split
- Ranking-/Results-Integration
- Testplan

### 1. Scaffold a new GameHub plugin

**Wann verwenden**

Wenn du ein neues Spielgeruest anlegen willst.

**Erwarteter Output**

- Plugin-Ordnerstruktur
- Basis-Manifest
- erste `createInitialState`-Version
- leere, aber korrekt angeschlossene `server`-, `mobile`- und `central`-Bausteine

**Prompt**

```text
You are adding a new game plugin to the Game Hub monorepo.

Constraints:
- Use the existing GameHub plugin contract from packages/sdk
- Do not invent your own session management
- Export gamePlugin, manifest and default
- Provide src/index.tsx with manifest, createInitialState, server, mobile and central
- Keep TypeScript strict and avoid any

Game idea:
<describe the game in 5-10 bullets>

Please scaffold:
- plugin folder structure
- package.json
- tsconfig.json
- src/index.tsx
- minimal reducer/state shape if needed
- initial mobile and central UI
```

### 2. Design central screen + mobile screen split

**Wann verwenden**

Wenn du unsicher bist, welche Infos auf Mobile vs Central gehoeren.

**Erwarteter Output**

- klare Verantwortungsgrenzen zwischen beiden Screens
- Vorschlag fuer private vs oeffentliche Informationen
- erste UI-Muster fuer Countdown, Results und Orientierung

**Prompt**

```text
I am integrating a game into Game Hub.

Please design the split between:
- central shared screen
- mobile personal player screen

Rules:
- central screen is the shared stage for all players
- mobile screen is personal input / private HUD
- do not duplicate the same responsibility on both screens
- identify which information is public and which is private

Game concept:
<describe the game>

Return:
- central responsibilities
- mobile responsibilities
- countdown/result patterns
- what should live in hubSession vs gameState
```

### 3. Implement deterministic reducer for realtime game

**Wann verwenden**

Wenn dein Spiel Tick-basiert ist.

**Erwarteter Output**

- deterministischer Reducer- und Event-Plan
- Tick- und Input-Queueing-Modell
- Trennung zwischen broadcastetem `gameState` und hostinternem Zustand

**Prompt**

```text
I am building a realtime Game Hub plugin.

Please design a deterministic reducer-based game state architecture.

Requirements:
- host-authoritative
- supports queued player inputs
- works with manifest.tickHz and server.onTick
- public gameState only
- no secrets in broadcast state
- reconnect behavior should be explicitly considered

Game idea:
<describe the realtime game>

Return:
- reducer state shape
- event types
- tick/update flow
- input queueing strategy
- what stays internal vs public
```

### 4. Integrate ranking/results with GameHostApi

**Wann verwenden**

Wenn du Score, Siege oder Placements in den Hub integrieren willst.

**Erwarteter Output**

- Mapping von Spielereignissen auf `GameHostApi.results`
- klares Bild, was der Hub anzeigen kann und was plugin-owned bleibt

**Prompt**

```text
I am integrating a Game Hub plugin and want to use the hub-owned ranking correctly.

Please map this game's outcomes onto:
- recordPlayerWin
- awardPlayerPoints
- awardTeamPoints
- setPlayerScore
- setPlayerStatus
- recordPlacement
- endRound
- endMatch

Game rules:
<describe scoring and victory>

Return:
- which GameHostApi.results calls to use
- when to call them
- which states should remain plugin-owned
- what the hub should display from them
```

### 5. Add tests for join/reconnect/restart

**Wann verwenden**

Wenn das Grundspiel steht und du robuste Tests willst.

**Erwarteter Output**

- fokussierte Unit- und View-Tests
- kurzer manueller QA-Plan fuer Join, Restart und Reconnect

**Prompt**

```text
I have a new Game Hub plugin.

Please propose a focused automated and manual test plan.

Include:
- reducer tests
- view tests
- restart-game behavior
- reconnect behavior
- central/mobile synchronization
- invalid input handling

Plugin summary:
<describe plugin state and phases>
```

### 6. Review my plugin against the GameHub contract

**Wann verwenden**

Wenn du einen bestehenden Plugin-Entwurf gegen die Plattform spiegeln willst.

**Erwarteter Output**

- Contract-Verletzungen
- Architektur- oder UX-Risiken
- gezielte Refactor-Vorschlaege
- fehlende Tests

**Prompt**

```text
Review this Game Hub plugin against the current monorepo contract.

Focus on:
- correct use of GamePluginDefinition
- clear split between hubSession and gameState
- proper use of GameHostApi
- mobile vs central responsibility split
- ranking/results integration
- restart/reconnect compatibility
- deterministic state handling

Code:
<paste plugin code or summarize architecture>

Return:
- contract violations
- risky assumptions
- recommended refactors
- missing tests
```

## Kompletter Beispiel-Prompt: vibecored game in Game Hub integrieren

```text
You are working inside the Game Hub monorepo.

I want to integrate a new plugin-based game called "<GAME NAME>".

Game concept:
- <bullet 1>
- <bullet 2>
- <bullet 3>
- <bullet 4>
- <bullet 5>

Architecture constraints:
- Host is authoritative
- Relay only routes messages
- Mobile is browser-based and should only handle player-facing UI and input
- Central screen is the shared public stage
- Use the existing Game Hub plugin contract from packages/sdk
- Use the existing protocol and do not invent a new transport
- Keep ranking session-local and report results via GameHostApi.results
- Keep gameState public and free of secrets
- TypeScript strict, no any

Please produce:
1. recommended state model
2. phase model
3. mobile vs central screen split
4. manifest proposal
5. parseInput strategy
6. server hook plan
7. ranking/results integration plan
8. restart and reconnect behavior
9. minimal file scaffold for plugins/<game-id>
10. test plan

Also call out:
- what the Hub already provides so the game should NOT reimplement it
- what belongs in hubSession vs gameState
- likely edge cases for this game inside Game Hub
```

## Troubleshooting / typische Fehler

### Mobile und Central doppeln dieselbe Aufgabe

Beispiel:

- beide zeigen dieselbe grosse Spielbuehne
- beide enthalten die gleiche Entscheidungslogik

Loesung:

- Central = gemeinsame Show
- Mobile = persoenliche Interaktion / Orientierung

### `gameState` enthaelt zu viel private Information

Beispiel:

- korrekte Antwort vor Reveal
- Host-seitige Secrets
- Debug-/Admin-Infos

Loesung:

- nur oeffentlichen Zustand broadcasten

### Nicht deterministische Realtime-Logik

Beispiel:

- Zustandsaenderungen aus zufaelligen UI-Effekten
- mehrere konkurrierende Taktquellen

Loesung:

- Host-Tick + reiner Reducer

### Plugin nutzt `controls` und eigene Mobile-UI gleichzeitig ohne Absicht

Das fuehrt oft zu doppelten Buttons oder zwei widerspruechlichen Interaktionsflaechen.

Loesung:

- bewusst entscheiden:
  - nur `controls`
  - oder eigene `mobile` UI
  - oder beides mit klar getrennter Rolle

### Ranking nicht an den Hub gemeldet

Dann fehlt die Integration in Lobby, Header und Result-Flow.

Loesung:

- `results`-Capabilities aktiv verwenden

## Praktischer Entwickler-Workflow

1. Spielidee in 5-10 Regeln schreiben
2. entscheiden: turn-based oder realtime
3. Mobile-vs-Central-Split definieren
4. `gameState` und Stages modellieren
5. Plugin scaffolden
6. `server`-Hooks implementieren
7. Mobile- und Central-UI anschliessen
8. Ranking / Results integrieren
9. Join / Restart / Reconnect testen
10. Build, Test, Lint laufen lassen

## Schlussgedanke

Die schnellste saubere Integration entsteht, wenn du Game Hub wirklich als Plattform behandelst:

- **Der Hub besitzt Session, Join, Ranking und Shell**
- **Dein Plugin besitzt Regeln, Spielzustand und UI-Szenen**

Wenn du diese Grenze sauber haeltst, kannst du neue Spiele sehr schnell vibecoden, ohne dass das Monorepo bei jedem Plugin wieder neu erfunden wird.
