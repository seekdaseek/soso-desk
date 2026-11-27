// One desk cycle: read inputs, make one call per asset, execute if allowed, reconcile open positions.
import { decide, macroRisk, lean } from "./engine.js";
import { soso, markPrice, heatmap } from "./sources.js";
import { openWithStop } from "./executor.js";
import { NETS, get } from "./sodex.js";
import { privateKeyToAccount } from "viem/accounts";

const OWNER = "0xB96c536A2b01584c5Dd8967AF0d8Ba97eBC2417F";
const ASSETS = [
  { asset: "BTC", perp: "BTC-USD", af: "BTCUSDT" },
  { asset: "ETH", perp: "ETH-USD", af: "ETHUSDT" },
];
const DAILY_LOSS_STOP_USD = 2; // testnet play money, stops new entries for the UTC day

const HM_DAILY_CAP = 12;
const BALANCE_FLOOR_USD = 0.2;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const BASE_RPCS = ["https://base-rpc.publicnode.com", "https://mainnet.base.org", "https://base.llamarpc.com", "https://1rpc.io/base"];
export async function payerBalanceUsd(addr) {
  const data = "0x70a08231" + addr.toLowerCase().replace("0x", "").padStart(64, "0");
  const errs = [];
  for (const url of BASE_RPCS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC_BASE, data }, "latest"] }), signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (typeof j.result === "string" && j.result.startsWith("0x") && j.result.length > 2) return Number(BigInt(j.result)) / 1e6;
      errs.push(`${new URL(url).host}: ${JSON.stringify(j.error ?? j).slice(0, 60)}`);
    } catch (e) { errs.push(`${new URL(url).host}: ${String(e.message).slice(0, 40)}`); }
  }
  throw new Error(errs.join(" | "));
}

// Cluster data costs money: only when flows lean, at most 12 a day, never below the balance floor.
async function guardedHeatmap(env, symbol, now, st) {
  const payerKey = env.PAYER_KEY || env.DESK_KEY;
  if (!payerKey) return { ok: false, error: "no payer key configured", paid: false };
  const addr = privateKeyToAccount(payerKey).address;
  const day = now - (now % 86400000);
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM payments WHERE kind='self' AND route='/api/liq-heatmap' AND ts>=?`).bind(day).first();
  if (n.n >= HM_DAILY_CAP) return { ok: false, error: "daily cap of 12 heatmap calls reached", paid: false };
  let bal;
  try {
    if (st.bal == null) { for (let i = 0; i < 3 && st.bal == null; i++) { try { st.bal = await payerBalanceUsd(addr); } catch (e) { if (i === 2) throw e; await new Promise((r) => setTimeout(r, 1500)); } } }
    bal = st.bal;
  } catch (e) { return { ok: false, error: `balance unreadable, not paying (${String(e.message).slice(0, 200)})`, paid: false }; }
  if (bal < BALANCE_FLOOR_USD) return { ok: false, error: `payer balance ${bal.toFixed(3)} USDC is below the 0.20 floor, hard stop`, paid: false };
  const h = await heatmap(payerKey, symbol);
  if (h.ok && h.paid) st.bal -= 0.02;
  return h;
}

export async function runCycle(env, now = Date.now(), trig = "real", force = {}) {
  if (trig !== "test") force = {}; // forcing a side is only ever allowed on a test run
  const db = env.DB;
  const s = soso(env.SOSO_API_KEY);
  const [news, events] = await Promise.all([s.news(), s.events()]);
  const macro = macroRisk(events.ok ? events.data : [], now);
  const out = [];
  const st = { bal: null };
  await reconcile(env); // close out finished positions before anything new is placed
  const exec = env.EXEC_NET === "testnet" && env.KILL !== "1";

  for (const a of ASSETS) {
    const [etf, mark] = await Promise.all([s.etf(a.asset), markPrice(NETS.mainnet.host, a.perp)]);
    let hm = null;
    const pre = etf.ok ? lean({ asset: a.asset, etf: etf.data, news: news.ok ? news.data : [] }) : "FLAT";
    if (pre !== "FLAT" && !force[a.asset]) hm = await guardedHeatmap(env, a.af, now, st);
    const levels = hm?.ok ? hm.data.levels : null;
    const missing = [!etf.ok && `etf: ${etf.error}`, !mark.ok && `mark: ${mark.error}`].filter(Boolean);
    let call;
    if (missing.length) {
      call = { asset: a.asset, ts: now, mark: mark.data ?? null, side: "FLAT", size: 0, stop: null, scores: {}, inputs: {}, flat_why: "input failed", reasons: [`Input failed this cycle (${missing.join("; ")}), the desk stays out.`] };
    } else {
      call = decide({ asset: a.asset, mark: mark.data, etf: etf.data, news: news.ok ? news.data : [], macro, levels, now });
      if (!news.ok) call.reasons.push(`Hot news feed failed (${news.error}), scored 0.`);
    }
    if (force[a.asset] && mark.ok) {
      const dirn = force[a.asset] === "LONG" ? -1 : 1;
      call = { ...call, side: force[a.asset], size: 0.5, stop: Number((mark.data * (1 + (dirn * 2) / 100)).toFixed(2)), notional_usd: 5, flat_why: null,
        reasons: [...call.reasons.slice(0, 2), `Forced ${force[a.asset]} on a test run to prove the order path. Not a desk call.`] };
    }
    const ins = await db.prepare(`INSERT INTO calls (ts,asset,side,size,stop,mark,notional_usd,scores,reasons,inputs,flat_why,cluster_status,hm_tx,hm_error,trig)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      now, a.asset, call.side, call.size ?? 0, call.stop ?? null, call.mark ?? null, call.notional_usd ?? null,
      JSON.stringify(call.scores), JSON.stringify(call.reasons), JSON.stringify(call.inputs), call.flat_why ?? null,
      levels ? "paid-self" : "unavailable", hm?.tx ?? null, hm && !hm.ok ? hm.error : (pre === "FLAT" ? "not fetched: flows read FLAT" : null), trig).run();
    const callId = ins.meta.last_row_id;
    if (hm?.ok && hm.paid) {
      await db.prepare(`INSERT INTO payments (ts,kind,route,payer,tx,network,amount_usd,call_id,trig) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(now, "self", "/api/liq-heatmap", hm.payer ?? OWNER, hm.tx, hm.network, hm.price_usd, callId, trig).run();
    }
    out.push({ asset: a.asset, side: call.side, callId });

    // Execution guards: one position per asset, daily loss stop, kill switch.
    if (call.side === "FLAT" || !exec) continue;
    const posNow = await get("testnet", `/perps/accounts/${OWNER}/positions`);
    const open = (posNow.data?.positions ?? []).find((p) => p.symbol === a.perp && p.active && Number(p.size) !== 0);
    if (open) { await db.prepare(`UPDATE calls SET exec_error=? WHERE id=?`).bind("skipped: position already open", callId).run(); continue; }
    const day = await db.prepare(`SELECT COALESCE(SUM(pnl),0) AS p FROM calls WHERE status='closed' AND closed_ts>=?`).bind(now - (now % 86400000)).first();
    if (day.p <= -DAILY_LOSS_STOP_USD) { await db.prepare(`UPDATE calls SET exec_error=? WHERE id=?`).bind("skipped: daily loss stop", callId).run(); continue; }
    const tm = await markPrice(NETS.testnet.host, a.perp);
    if (!tm.ok) { await db.prepare(`UPDATE calls SET exec_error=? WHERE id=?`).bind("skipped: testnet mark failed", callId).run(); continue; }
    const stopPx = call.stop * (tm.data / call.mark);
    const st0 = await get("testnet", `/perps/accounts/${OWNER}/state`);
    const wb0 = Number(st0.data?.B?.[0]?.wb);
    const r = await openWithStop({ net: "testnet", accountID: Number(env.SODEX_ACCOUNT_ID), owner: OWNER, signerKey: env.DESK_KEY, symbol: a.perp,
      side: call.side, notionalUsd: call.notional_usd, stopPx, tag: `d${callId}x${(now / 1000 | 0).toString(36)}` });
    await db.prepare(`UPDATE calls SET net='testnet', entry_order_id=?, entry_cl_id=?, qty=?, stop_order_id=?, stop_cl_id=?, exec_error=?, status=?, wb_before=? WHERE id=?`)
      .bind(r.entry.orderID ? String(r.entry.orderID) : null, r.entry.clOrdID, r.qty, r.stop?.orderID ? String(r.stop.orderID) : null, r.stop?.clOrdID ?? null,
        r.ok ? null : (r.entry.error ?? r.stop?.error ?? "order failed"), r.entry.orderID ? "open" : "failed", Number.isFinite(wb0) ? wb0 : null, callId).run();
  }
  await reconcile(env);
  await db.prepare(`INSERT INTO runs (ts,kind,ok,detail) VALUES (?,?,?,?)`).bind(now, "cycle", 1, JSON.stringify(out)).run();
  return out;
}

// Mark calls closed when the exchange shows no active position; take realised P&L from position history.
export async function reconcile(env) {
  const db = env.DB;
  const open = (await db.prepare(`SELECT * FROM calls WHERE status='open' AND net='testnet'`).all()).results;
  if (!open.length) return;
  const pos = await get("testnet", `/perps/accounts/${OWNER}/positions`);
  const active = new Set((pos.data?.positions ?? []).filter((p) => p.active && Number(p.size) !== 0).map((p) => p.symbol));
  for (const c of open) {
    const sym = c.asset + "-USD";
    const p = (pos.data?.positions ?? []).find((x) => x.symbol === sym);
    if (p && c.entry_px == null) await db.prepare(`UPDATE calls SET entry_px=? WHERE id=?`).bind(Number(p.avgEntryPrice), c.id).run();
    if (active.has(sym)) continue;
    if (!pos.ok && pos.code !== 0) continue;
    const h = await get("testnet", `/perps/accounts/${OWNER}/positions/history?symbol=${sym}&accountID=${env.SODEX_ACCOUNT_ID}&startTime=${c.ts - 60000}&limit=20`);
    const row = (h.data?.positions ?? h.data ?? []).find((x) => Number(x.createdAt ?? x.openedAt ?? 0) >= c.ts - 60000) ?? (h.data?.positions ?? h.data ?? [])[0];
    let pnl = row ? Number(row.realizedPnL) : null;
    if (pnl == null && c.wb_before != null && !active.size) {
      // history is empty on testnet: use the change in perps wallet balance, fees and funding included
      const st = await get("testnet", `/perps/accounts/${OWNER}/state`);
      const wb = Number(st.data?.B?.[0]?.wb);
      if (Number.isFinite(wb)) pnl = Number((wb - c.wb_before).toFixed(6));
    }
    await db.prepare(`UPDATE calls SET status='closed', closed_ts=?, exit_px=?, pnl=? WHERE id=?`)
      .bind(Date.now(), row ? Number(row.avgClosePrice) : null, pnl, c.id).run();
  }
}
