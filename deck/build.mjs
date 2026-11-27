// Fills the live ledger numbers into deck.html and renders the PDF.   node deck/build.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const L = await (await fetch("https://soso-desk.ochinimus.workers.dev/api/ledger")).json();
const calls = L.calls; // real calls only, tests are excluded by the API
const flat = L.stats.flat;
const selfP = L.payments.filter((p) => p.kind === "self");
const callTx = ([...L.payments, ...L.test_payments].find((p) => p.route.startsWith("/call/")) ?? {}).tx ?? "none yet";
const latest = ["BTC", "ETH"].map((a) => {
  const c = calls.find((x) => x.asset === a) ?? L.tests.find((x) => x.asset === a);
  return c ? `${a} ${c.side} at ${c.mark}` : null;
}).filter(Boolean).join(", ");

const fill = {
  "@@WHEN@@": new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
  "@@CALLS@@": calls.length, "@@FLAT@@": flat, "@@DIR@@": calls.length - flat, "@@ORDERS@@": L.stats.orders,
  "@@LATEST@@": latest, "@@SELF@@": selfP.length, "@@SELFUSD@@": L.stats.self_spend.toFixed(2),
  "@@OUTSIDE@@": L.stats.outside_paid, "@@CALLTX@@": callTx,
};
let html = readFileSync(`${dir}/deck.html`, "utf8");
for (const [k, v] of Object.entries(fill)) html = html.replaceAll(k, String(v));
if (/@@/.test(html)) throw new Error("unfilled placeholder");
writeFileSync(`${dir}/.deck-filled.html`, html);
const b = await chromium.launch({ headless: true, channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`file://${dir}/.deck-filled.html`);
await p.pdf({ path: `${dir}/soso-desk-deck.pdf`, width: "1280px", height: "720px", printBackground: true });
await b.close();
console.log("deck built", JSON.stringify(fill));
