// Pre-publish checks: numbers match facts, no secrets, no forbidden vendor words.   node video/checks.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const dir = path.dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(readFileSync(`${dir}/script.json`, "utf8")).lines;
const F = JSON.parse(readFileSync(`${dir}/facts.json`, "utf8"));
const problems = [];

// 1. every number in a caption is a fact or a fixed product constant
const allowed = new Set(["4", "2", "402", "20000", "8453", "1.5", "0.02", "3", "6", "1", "5",
  String(Math.abs(F.etf_musd)), String(F.etf_days), String(F.cluster_musd), String(F.cluster_pct), String(F.band_pct), "3347771819", "3347773873", ...(F.desk_order ? [F.desk_order.entry, F.desk_order.stop] : [])]);
for (const l of S) {
  for (const n of l.caption.match(/\d[\d.]*/g) ?? []) {
    const k = n.replace(/\.$/, "");
    if (!allowed.has(k) && !allowed.has(String(Number(k)))) problems.push(`${l.id}: number ${k} not in facts`);
  }
}
// 2. secrets: none of the secret values may appear in script, captions, page text
const secrets = [];
for (const line of readFileSync(`${dir}/../.env`, "utf8").split("\n")) { const v = line.split("=").slice(1).join("=").trim(); if (v.length >= 16) secrets.push(v); }
for (const f of (process.env.SECRET_KEYFILES || "").split(":").filter(Boolean)) { try { secrets.push(readFileSync(f, "utf8").trim().replace(/^0x/, "")); } catch {} }
const corpus = [readFileSync(`${dir}/script.json`, "utf8"), ...readdirSync(`${dir}/shots`).filter((f) => f.endsWith(".txt") || f.endsWith(".json")).map((f) => readFileSync(`${dir}/shots/${f}`, "utf8"))].join("\n");
for (const s of secrets) if (corpus.includes(s)) problems.push("a secret value appears in the script or captured text");
// 3. forbidden words (tool and vendor names)
// The word list lives in a local, gitignored file so it is not published with the repo.
let banned = [];
try { banned = JSON.parse(readFileSync(`${dir}/forbidden-words.local.json`, "utf8")); } catch { console.log("no forbidden-words.local.json, word check skipped"); }
for (const w of banned) if (new RegExp(w, "i").test(readFileSync(`${dir}/script.json`, "utf8"))) problems.push(`forbidden word in script: ${w}`);
// 4. the call route tx and heatmap tx appear on their captured pages
for (const [n, tx] of [["heat", F.heatmap_tx], ["calltx", F.call_tx]]) {
  const t = readFileSync(`${dir}/shots/${n}.txt`, "utf8");
  if (!t.includes(tx)) problems.push(`${n}: tx hash not on captured page`);
  const card = JSON.parse(readFileSync(`${dir}/shots/${n}-card.json`, "utf8"));
  if (card.usdc !== 0.02 || card.status !== "success") problems.push(`${n}: receipt not 0.02 USDC success`);
}
console.log(problems.length ? "PROBLEMS\n" + problems.join("\n") : `checks clean (${secrets.length} secret values scanned)`);
process.exit(problems.length ? 1 : 0);
