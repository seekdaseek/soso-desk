// The desk's decision rules. Pure functions: same inputs, same call. No network here.

export const CFG = {
  etfDays: 5,
  clusterBlockPct: 1.5,   // no entry with a big cluster this close to the mark
  clusterSearchPct: 4.0,  // stop is placed beyond the nearest big cluster inside this range
  clusterMult: 3,         // "big" = level >= 3x the median level and >= clusterMinUsd
  clusterMinUsd: 250000,
  defaultStopPct: 2.0,
  stopBufferPct: 0.3,
  capUsd: 5,              // position cap while testing
  bigPrints: /FOMC|Fed (Interest|Funds)|CPI|Nonfarm|NFP|PCE|Powell/i,
};

const BULL = /\b(inflow|inflows|surge|surges|rally|rallies|record high|approve[sd]?|adopt|adoption|rate cut|buy|buys|bought|accumulate|upgrade)\b/i;
const BEAR = /\b(outflow|outflows|plunge|plunges|crash|sell-?off|hack|exploit|ban|lawsuit|rate hike|liquidat\w+|dump|downgrade|bankrupt\w*)\b/i;

export function etfScore(days) {
  // days: newest first, each {date,total_net_inflow}. Uses the last etfDays rows.
  const d = days.slice(0, CFG.etfDays).map((x) => Number(x.total_net_inflow));
  if (d.length < 3) return { score: 0, sum: 0, pos: 0, n: d.length, why: "not enough ETF days" };
  const sum = d.reduce((a, b) => a + b, 0);
  const pos = d.filter((x) => x > 0).length;
  let score = 0;
  if (sum > 0) score = pos >= d.length - 1 ? 2 : 1;
  else if (sum < 0) score = pos <= 1 ? -2 : -1;
  return { score, sum, pos, n: d.length };
}

export function newsScore(items, asset) {
  const kw = asset === "BTC" ? /bitcoin|\bBTC\b/i : /ethereum|\bETH\b|ether\b/i;
  let bull = 0, bear = 0, n = 0;
  for (const it of items) {
    const t = `${it.title ?? ""}`;
    if (!kw.test(t)) continue;
    n++;
    const b = BULL.test(t), r = BEAR.test(t);
    if (b && !r) bull++; else if (r && !b) bear++;
  }
  const net = bull - bear;
  return { score: net >= 2 ? 1 : net <= -2 ? -1 : 0, n, bull, bear };
}

// events: [{date:'YYYY-MM-DD', events:[...]}]; looks 48h ahead from `now` (ms).
export function macroRisk(events, now) {
  const hits = [];
  for (const e of events ?? []) {
    const t = Date.parse(e.date + "T00:00:00Z");
    if (t + 86400000 < now || t > now + 2 * 86400000) continue;
    for (const name of e.events ?? []) if (CFG.bigPrints.test(name)) hits.push({ date: e.date, name: name.trim() });
  }
  return { big: hits.length > 0, hits };
}

// levels: [{price_low, price_high, usd_total, longs_usd, shorts_usd}]
export function findClusters(levels, mark) {
  if (!levels?.length) return [];
  const sorted = levels.map((l) => l.usd_total).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || 0;
  const min = Math.max(CFG.clusterMult * med, CFG.clusterMinUsd);
  return levels
    .filter((l) => l.usd_total >= min)
    .map((l) => {
      const px = (l.price_low + l.price_high) / 2;
      return { price: px, usd: l.usd_total, pct: ((px - mark) / mark) * 100, low: l.price_low, high: l.price_high };
    });
}

export function decide({ asset, mark, etf, news, macro, levels, now }) {
  const e = etfScore(etf), n = newsScore(news, asset);
  const total = e.score + n.score;
  const reasons = [];
  reasons.push(`ETF net flow, last ${e.n} days: ${(e.sum / 1e6).toFixed(0)} M USD, ${e.pos} of ${e.n} days positive (score ${e.score >= 0 ? "+" : ""}${e.score}).`);
  reasons.push(n.n ? `Hot news: ${n.n} ${asset} headlines, ${n.bull} bullish, ${n.bear} bearish (score ${n.score >= 0 ? "+" : ""}${n.score}).` : `Hot news: no ${asset} headlines in the feed (score 0).`);

  const base = { asset, ts: now, mark, scores: { etf: e.score, news: n.score, total }, inputs: { etf: e, news: n, macro: macro.hits } };
  let side = total >= 2 ? "LONG" : total <= -2 ? "SHORT" : "FLAT";

  if (!levels) {
    reasons.push("Liquidation clusters unavailable this cycle, so no entry is allowed.");
    return { ...base, side: "FLAT", size: 0, stop: null, reasons, flat_why: "no cluster data" };
  }
  const clusters = findClusters(levels, mark);
  const near = clusters.filter((c) => Math.abs(c.pct) <= CFG.clusterBlockPct).sort((a, b) => Math.abs(a.pct) - Math.abs(b.pct))[0];
  if (side === "FLAT") {
    reasons.push(`Signals are mixed (total ${total}), the desk stays out.`);
    return { ...base, side, size: 0, stop: null, reasons, flat_why: "mixed signals" };
  }
  if (near) {
    reasons.push(`Liquidation cluster of ${(near.usd / 1e6).toFixed(2)} M USD at ${near.price.toFixed(0)}, ${Math.abs(near.pct).toFixed(2)} percent from the mark, inside the ${CFG.clusterBlockPct} percent no-entry band.`);
    return { ...base, side: "FLAT", size: 0, stop: null, reasons, flat_why: "cluster within band", cluster: near };
  }
  // Stop beyond the nearest big cluster on the stop side, else a default distance.
  const dir = side === "LONG" ? -1 : 1;
  const beyond = clusters.filter((c) => Math.sign(c.pct) === dir && Math.abs(c.pct) <= CFG.clusterSearchPct).sort((a, b) => Math.abs(a.pct) - Math.abs(b.pct))[0];
  let stop, stopWhy;
  if (beyond) {
    stop = beyond.price * (1 + (dir * CFG.stopBufferPct) / 100);
    stopWhy = `stop ${stop.toFixed(0)} sits ${CFG.stopBufferPct} percent beyond the ${(beyond.usd / 1e6).toFixed(2)} M USD cluster at ${beyond.price.toFixed(0)}`;
  } else {
    stop = mark * (1 + (dir * CFG.defaultStopPct) / 100);
    stopWhy = `no big cluster within ${CFG.clusterSearchPct} percent on the stop side, default ${CFG.defaultStopPct} percent stop at ${stop.toFixed(0)}`;
  }
  reasons.push(`No big cluster within ${CFG.clusterBlockPct} percent of ${mark.toFixed(0)}; ${stopWhy}.`);
  let size = Math.abs(total) >= 3 ? 1 : 0.5;
  if (macro.big) { size = size / 2; reasons.push(`Risk input: ${macro.hits[0].name} on ${macro.hits[0].date}, size halved.`); }
  return { ...base, side, size, stop: Number(stop.toFixed(2)), notional_usd: Number((CFG.capUsd * size).toFixed(2)), reasons, stop_why: stopWhy };
}

// Cheap pre-read used to decide whether paying for cluster data is worth it.
export function lean({ asset, etf, news }) {
  const total = etfScore(etf).score + newsScore(news, asset).score;
  return total >= 2 ? "LONG" : total <= -2 ? "SHORT" : "FLAT";
}
