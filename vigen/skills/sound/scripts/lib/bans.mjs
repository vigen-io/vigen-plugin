// The skill-wide blacklist (../../banned.json): sounds the user rejected by ear, for every video, forever.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GLOBAL_BANS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "banned.json");

export function readGlobalBans() {
  try {
    const j = JSON.parse(fs.readFileSync(GLOBAL_BANS, "utf8"));
    return { ...j, names: j.names || [], patterns: j.patterns || [] };
  } catch {
    return { names: [], patterns: [] };
  }
}

/** True when a sound (a catalog hit, a pool entry, or just a file path) is on the blacklist. */
export function isGloballyBanned(x) {
  const g = readGlobalBans();
  const name = String(x?.name ?? "").toLowerCase();
  const text = `${x?.name ?? ""} ${x?.description ?? ""} ${x?.file ?? ""}`.toLowerCase().replace(/[-_]+/g, " ");
  if (name && g.names.some((n) => n.name.toLowerCase() === name)) return true;
  return g.patterns.some((p) => new RegExp(p.match, "i").test(text));
}
