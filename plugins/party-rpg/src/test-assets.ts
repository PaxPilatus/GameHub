/** Feste Platzhalter-Assets und Mapping Spieler → Bild (nach sortierter playerId). */

import type { PlayerRole } from "@game-hub/protocol";

import { isPartyRpgParticipantRole } from "./reducer.js";

/**
 * Laufzeit-URLs ohne statischen PNG-Import: Der Host laedt `dist/index.js` mit
 * nativem Node-`import()` (ohne Vite). `import "./x.png?url"` fuehrt dort zu
 * ERR_UNKNOWN_FILE_EXTENSION. `new URL` + `import.meta.url` ist in Node und im
 * Vite-Bundler fuer Mobile/Renderer unterstuetzt.
 */
export const PARTY_RPG_TEST_SITUATION_ID = "party_rpg_test_flow";

const SCENARIO_FILE = "test szenario.png";
const JUDGE_FILE = "test judge.png";
const CHAR1_FILE = "test charakter 1.png";
const CHAR2_FILE = "test charakter 2.png";

function assetUrlEncoded(fileName: string): string {
  return new URL(`./assets/${encodeURIComponent(fileName)}`, import.meta.url).href;
}

function assetUrlLiteral(fileName: string): string {
  return new URL(`./assets/${fileName}`, import.meta.url).href;
}

/**
 * Kanonisch URL-encodierte Segmente; optional zweite Variante ohne Doppel-Encoding.
 */
export function partyRpgAssetUrlVariants(fileName: string): readonly string[] {
  const a = assetUrlEncoded(fileName);
  const b = assetUrlLiteral(fileName);
  return a === b ? [a] : [a, b];
}

export function scenarioPlaceholderHref(): string {
  return assetUrlEncoded(SCENARIO_FILE);
}

export function scenarioPlaceholderUrls(): readonly string[] {
  return partyRpgAssetUrlVariants(SCENARIO_FILE);
}

export function judgePlaceholderHref(): string {
  return assetUrlEncoded(JUDGE_FILE);
}

export function judgePlaceholderUrls(): readonly string[] {
  return partyRpgAssetUrlVariants(JUDGE_FILE);
}

function characterFileForSlot(slot: number): string {
  return slot === 0 ? CHAR1_FILE : CHAR2_FILE;
}

export function characterPlaceholderHref(
  playerId: string,
  sortedPlayerIds: readonly string[],
): string {
  const idx = sortedPlayerIds.indexOf(playerId);
  const slot = idx < 0 ? 0 : idx % 2;
  return assetUrlEncoded(characterFileForSlot(slot));
}

export function characterPlaceholderUrls(
  playerId: string,
  sortedPlayerIds: readonly string[],
): readonly string[] {
  const idx = sortedPlayerIds.indexOf(playerId);
  const slot = idx < 0 ? 0 : idx % 2;
  return partyRpgAssetUrlVariants(characterFileForSlot(slot));
}

export function sortedPlayerIdsFromRows(rows: readonly { playerId: string }[]): string[] {
  return [...rows.map((row) => row.playerId)].sort((a, b) => a.localeCompare(b));
}

/** Priorisiert Live-Session-Spieler; Fallback auf `playerRows`, wenn die Liste noch leer ist. */
export function sortedPlayerIdsFromSnapshots(
  players: readonly { playerId: string; role: PlayerRole }[],
  rows: readonly { playerId: string }[],
): string[] {
  const fromProps = players
    .filter((player) => isPartyRpgParticipantRole(player.role))
    .map((player) => player.playerId);
  if (fromProps.length > 0) {
    return [...fromProps].sort((a, b) => a.localeCompare(b));
  }
  return sortedPlayerIdsFromRows(rows);
}
