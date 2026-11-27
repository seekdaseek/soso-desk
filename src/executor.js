// Real SoDEX perps execution: market entry, then a reduce-only stop. Nothing is simulated.
import { signedRequest, perpsOrderItem, get } from "./sodex.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const roundTo = (x, step, dir = "down") => {
  const n = x / step;
  return Number(((dir === "up" ? Math.ceil(n - 1e-9) : Math.floor(n + 1e-9)) * step).toFixed(8));
};

export async function symbolSpec(net, name) {
  const j = await get(net, `/perps/markets/symbols?symbol=${name}`);
  return j.data.find((m) => m.name === name);
}

export async function markPrice(net, name) {
  const j = await get(net, `/perps/markets/mark-prices?symbol=${name}`);
  return Number(j.data[0].markPrice);
}

// side: "LONG" | "SHORT". notionalUsd is capped by the caller; the exchange minimum notional may force a floor.
export async function openWithStop({ net, accountID, owner, signerKey, keyName, symbol, side, notionalUsd, stopPx, tag }) {
  const spec = await symbolSpec(net, symbol);
  const mark = await markPrice(net, symbol);
  const step = Number(spec.stepSize), tick = Number(spec.tickSize);
  const qty = roundTo(Math.max(notionalUsd, Number(spec.minNotional) * 1.05) / mark, step, "up");
  const stop = roundTo(stopPx, tick, side === "LONG" ? "down" : "up");
  const buy = side === "LONG" ? 1 : 2;
  const id = `${tag}`.slice(0, 30);
  const base = { net, engine: "perps", keyName, apiKey: signerKey };

  const entry = await signedRequest({ ...base, method: "POST", path: "/trade/orders", type: "newOrder",
    params: { accountID, symbolID: spec.id, orders: [perpsOrderItem({ clOrdID: `${id}-e`, side: buy, type: 2, tif: 3, quantity: qty })] } });
  const e = entry.json?.data?.[0];
  const out = { symbol, side, qty, mark, stopPx: stop, entry: { http: entry.status, code: entry.json?.code, orderID: e?.orderID, clOrdID: `${id}-e`, error: e?.error ?? entry.json?.error } };
  if (!e || e.code !== 0 || !e.orderID) return { ...out, ok: false };

  await sleep(2500);
  const hist = await get(net, `/perps/accounts/${owner}/orders/history?symbol=${symbol}&accountID=${accountID}&limit=20`);
  const ho = (hist.data || []).find((o) => String(o.orderID) === String(e.orderID));
  out.entry.status = ho?.status; out.entry.filledQty = ho?.filledQty ?? ho?.executedQty; out.entry.avgPx = ho?.avgPx ?? ho?.avgPrice;

  const slSide = side === "LONG" ? 2 : 1;
  const sl = await signedRequest({ ...base, method: "POST", path: "/trade/orders", type: "newOrder",
    params: { accountID, symbolID: spec.id, orders: [perpsOrderItem({ clOrdID: `${id}-s`, side: slSide, type: 2, tif: 3, quantity: qty, reduceOnly: true, stopPrice: stop, stopType: 1, modifier: 2 })] } });
  const s = sl.json?.data?.[0];
  out.stop = { http: sl.status, code: sl.json?.code, orderID: s?.orderID, clOrdID: `${id}-s`, error: s?.error ?? sl.json?.error };
  out.ok = !!(s && s.code === 0 && s.orderID);
  return out;
}

export async function closePosition({ net, accountID, signerKey, keyName, symbol, side, qty, tag }) {
  const spec = await symbolSpec(net, symbol);
  return signedRequest({ net, engine: "perps", keyName, apiKey: signerKey, method: "POST", path: "/trade/orders", type: "newOrder",
    params: { accountID, symbolID: spec.id, orders: [perpsOrderItem({ clOrdID: `${tag}`.slice(0, 30), side: side === "LONG" ? 2 : 1, type: 2, tif: 3, quantity: qty, reduceOnly: true })] } });
}

export async function placeStop({ net, accountID, signerKey, keyName, symbol, side, qty, stopPx, tag }) {
  const spec = await symbolSpec(net, symbol);
  const tick = Number(spec.tickSize);
  const stop = roundTo(stopPx, tick, side === "LONG" ? "down" : "up");
  const r = await signedRequest({ net, engine: "perps", keyName, apiKey: signerKey, method: "POST", path: "/trade/orders", type: "newOrder",
    params: { accountID, symbolID: spec.id, orders: [perpsOrderItem({ clOrdID: `${tag}`.slice(0, 30), side: side === "LONG" ? 2 : 1, type: 2, tif: 3, quantity: qty, reduceOnly: true, stopPrice: stop, stopType: 1, modifier: 2 })] } });
  const s = r.json?.data?.[0];
  return { http: r.status, code: r.json?.code, orderID: s?.orderID, error: s?.error ?? r.json?.error, stopPx: stop };
}
