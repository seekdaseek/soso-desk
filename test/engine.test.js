import test from "node:test";
import assert from "node:assert/strict";
import { decide, etfScore, newsScore, macroRisk, findClusters } from "../src/engine.js";

const inflow = (...v) => v.map((x, i) => ({ date: `2026-11-${20 - i}`, total_net_inflow: x * 1e6 }));
const flatLevels = Array.from({ length: 40 }, (_, i) => ({ price_low: 58000 + i * 100, price_high: 58100 + i * 100, usd_total: 100000, longs_usd: 50000, shorts_usd: 50000 }));
const withCluster = (price, usd) => flatLevels.map((l) => (l.price_low <= price && price < l.price_high ? { ...l, usd_total: usd } : l));
const NOW = Date.parse("2026-11-23T00:00:00Z");

test("etf score", () => {
  assert.equal(etfScore(inflow(100, 50, 80, 20, 60)).score, 2);
  assert.equal(etfScore(inflow(100, -50, 80, -20, 10)).score, 1);
  assert.equal(etfScore(inflow(-100, -50, -80, 20, -60)).score, -2);
  assert.equal(etfScore(inflow(-100, 50, 80, -20, -60)).score, -1);
  assert.equal(etfScore(inflow(1, 2)).score, 0);
});
test("news score ignores other assets", () => {
  const items = [{ title: "Bitcoin ETF inflows surge" }, { title: "Bitcoin rally continues" }, { title: "Solana hack" }];
  assert.equal(newsScore(items, "BTC").score, 1);
  assert.equal(newsScore(items, "ETH").score, 0);
});
test("macro risk only inside 48h and only big prints", () => {
  const ev = [{ date: "2026-11-24", events: ["Core PCE Price Index (MoM)"] }, { date: "2026-11-30", events: ["CPI"] }, { date: "2026-11-24", events: ["New Home Sales"] }];
  const r = macroRisk(ev, NOW);
  assert.equal(r.hits.length, 1);
  assert.equal(macroRisk([], NOW).big, false);
});
test("long on strong flows, stop is default when no cluster", () => {
  const c = decide({ asset: "BTC", mark: 61000, etf: inflow(100, 50, 80, 20, 60), news: [{ title: "Bitcoin ETF inflows surge" }, { title: "Bitcoin rally" }], macro: { big: false, hits: [] }, levels: flatLevels, now: NOW });
  assert.equal(c.side, "LONG");
  assert.equal(c.size, 1);
  assert.ok(Math.abs(c.stop - 61000 * 0.98) < 1);
  assert.equal(c.reasons.length, 3);
});
test("cluster inside 1.5 percent blocks the entry", () => {
  const c = decide({ asset: "BTC", mark: 61000, etf: inflow(100, 50, 80, 20, 60), news: [], macro: { big: false, hits: [] }, levels: withCluster(61450, 5e6), now: NOW });
  assert.equal(c.side, "FLAT");
  assert.equal(c.flat_why, "cluster within band");
});
test("stop goes beyond a cluster on the stop side", () => {
  // mark 61000, cluster at ~59250 (-2.9 percent) below: long stop sits 0.3 percent under it
  const c = decide({ asset: "BTC", mark: 61000, etf: inflow(100, 50, 80, 20, 60), news: [{ title: "Bitcoin rally" }, { title: "Bitcoin inflows" }], macro: { big: false, hits: [] }, levels: withCluster(59250, 5e6), now: NOW });
  assert.equal(c.side, "LONG");
  assert.ok(c.stop < 59250 && c.stop > 59000, `stop ${c.stop}`);
});
test("short mirrors: stop above a cluster", () => {
  const lv = Array.from({ length: 40 }, (_, i) => ({ price_low: 1500 + i * 10, price_high: 1510 + i * 10, usd_total: 100000, longs_usd: 0, shorts_usd: 100000 }));
  lv.find((l) => l.price_low === 1730).usd_total = 5e6; // about +2.06 percent above 1700
  const c = decide({ asset: "ETH", mark: 1700, etf: inflow(-100, -50, -80, -20, -60), news: [], macro: { big: false, hits: [] }, levels: lv, now: NOW });
  assert.equal(c.side, "SHORT");
  assert.ok(c.stop > 1735 && c.stop < 1745, `stop ${c.stop}`);
});
test("macro print halves size", () => {
  const c = decide({ asset: "BTC", mark: 61000, etf: inflow(100, 50, 80, 20, 60), news: [{ title: "Bitcoin rally" }, { title: "Bitcoin inflows" }], macro: { big: true, hits: [{ date: "2026-11-24", name: "Core PCE" }] }, levels: flatLevels, now: NOW });
  assert.equal(c.size, 0.5);
});
test("no cluster data means FLAT, never a guess", () => {
  const c = decide({ asset: "BTC", mark: 61000, etf: inflow(100, 50, 80, 20, 60), news: [], macro: { big: false, hits: [] }, levels: null, now: NOW });
  assert.equal(c.side, "FLAT");
  assert.equal(c.flat_why, "no cluster data");
});
test("mixed signals are FLAT", () => {
  const c = decide({ asset: "BTC", mark: 61000, etf: inflow(100, -50, 80, -20, -60), news: [], macro: { big: false, hits: [] }, levels: flatLevels, now: NOW });
  assert.equal(c.side, "FLAT");
});
