import { PAGE } from "./page.js";
import { runCycle, reconcile } from "./cycle.js";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { encodePaymentRequiredHeader, decodePaymentSignatureHeader, encodePaymentResponseHeader } from "@x402/core/http";

const PAY_TO = "0x22DB3A9686EE5261e7Bf3ed4f91277232E8076e6"; // AgentFeed Base treasury
const DESK_ADDR = "0xB96c536A2b01584c5Dd8967AF0d8Ba97eBC2417F";
const PAYER_ADDR = "0x4e64ad598a70D47D33Aa1C6D7FC07d723dd3476e"; // x402-test wallet, ours: payments from it are "self"
const PRICE_USD = 0.02;
const NETWORK = "eip155:8453";
const json = (o, status = 200, h = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...h } });

let _server;
async function x402(env) {
  if (_server) return _server;
  const s = new x402ResourceServer(new HTTPFacilitatorClient({ url: env.FACILITATOR_URL || "https://facilitator.payai.network" }));
  s.register(NETWORK, new ExactEvmScheme());
  await s.initialize();
  return (_server = s);
}

const parse = (c) => ({ ...c, reasons: JSON.parse(c.reasons || "[]"), scores: JSON.parse(c.scores || "{}") });

export async function ledger(env) {
  const all = (await env.DB.prepare(`SELECT * FROM calls ORDER BY ts DESC LIMIT 300`).all()).results.map(parse);
  const calls = all.filter((c) => c.trig !== "test");
  const tests = all.filter((c) => c.trig === "test");
  const asc = [...calls].reverse();
  for (const c of calls) {
    if (c.side === "FLAT") continue;
    const next = asc.find((n) => n.asset === c.asset && n.ts > c.ts);
    if (next && c.mark && next.mark) c.grade = (next.mark - c.mark) * (c.side === "LONG" ? 1 : -1) > 0 ? "hit" : "miss";
  }
  const pays = (await env.DB.prepare(`SELECT * FROM payments ORDER BY ts DESC LIMIT 200`).all()).results;
  const payments = pays.filter((p) => p.trig !== "test");
  const testPayments = pays.filter((p) => p.trig === "test");
  const dir = calls.filter((c) => c.side !== "FLAT");
  const graded = dir.filter((c) => c.grade);
  const hits = graded.filter((c) => c.grade === "hit").length;
  const hasOrders = calls.some((c) => c.entry_order_id);
  return {
    orders_note: hasOrders
      ? "Orders are real signed SoDEX testnet orders with real order IDs. Mainnet is not used yet."
      : "No desk order has been sent yet, and nothing on this page is simulated. An order appears the first time a call is LONG or SHORT.",
    stats: {
      calls: calls.length,
      flat: calls.length - dir.length,
      directional: dir.length,
      graded: graded.length,
      hit_rate: graded.length ? hits / graded.length : null,
      orders: calls.filter((c) => c.entry_order_id).length,
      outside_paid: payments.filter((p) => p.kind === "outside").length,
      self_spend: payments.filter((p) => p.kind === "self").reduce((a, p) => a + (p.amount_usd || 0), 0),
      tests_excluded: tests.length,
    },
    calls, payments, tests, test_payments: testPayments,
  };
}

async function paidCall(req, env, asset) {
  const row = await env.DB.prepare(`SELECT * FROM calls WHERE asset=? ORDER BY ts DESC LIMIT 1`).bind(asset).first();
  if (!row) return json({ error: "no call yet" }, 503);
  const url = new URL(req.url);
  const server = await x402(env);
  const reqs = await server.buildPaymentRequirements({ scheme: "exact", network: NETWORK, payTo: PAY_TO, price: `$${PRICE_USD}`, maxTimeoutSeconds: 60 });
  const resource = { url: url.origin + url.pathname, description: `soso desk ${asset} call: LONG, SHORT or FLAT with size, stop and reasons`, mimeType: "application/json" };
  const challenge = async (error) => {
    const pr = await server.createPaymentRequiredResponse(reqs, resource, error);
    return json({ error: error ?? "payment required", price_usd: PRICE_USD }, 402, { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(pr) });
  };
  const sigH = req.headers.get("payment-signature") ?? req.headers.get("x-payment");
  if (!sigH) return challenge();
  let payload, match;
  try {
    payload = decodePaymentSignatureHeader(sigH);
    match = server.findMatchingRequirements(reqs, payload);
  } catch {
    return challenge("bad payment header");
  }
  if (!match) return challenge("no matching requirement");
  const v = await server.verifyPayment(payload, match);
  if (!v.isValid) return challenge(v.invalidReason ?? "payment invalid");
  const s = await server.settlePayment(payload, match);
  if (!s.success) return challenge(s.errorReason ?? "settlement failed");
  const own = [DESK_ADDR, PAYER_ADDR].map((x) => x.toLowerCase());
  const kind = s.payer && own.includes(s.payer.toLowerCase()) ? "self" : "outside";
  await env.DB.prepare(`INSERT INTO payments (ts,kind,route,payer,tx,network,amount_usd,call_id,trig) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(Date.now(), kind, `/call/${asset}`, s.payer ?? null, s.transaction, s.network, PRICE_USD, row.id, kind === "self" ? "test" : "real")
    .run();
  const c = parse(row);
  return json(
    { asset, ts: c.ts, call: c.side, size: c.size, stop: c.stop, mark: c.mark, reasons: c.reasons, scores: c.scores, entry_order_id: c.entry_order_id, status: c.status, ledger: url.origin + "/api/ledger" },
    200,
    { "PAYMENT-RESPONSE": encodePaymentResponseHeader(s) },
  );
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === "/") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
    if (u.pathname === "/api/ledger") return json(await ledger(env), 200, { "cache-control": "public, max-age=30" });
    if (u.pathname === "/health") return json({ ok: true });
    if (u.pathname === "/diag") {
      const last = await env.DB.prepare(`SELECT ts,ok,detail FROM runs ORDER BY ts DESC LIMIT 1`).first();
      return json({
        secrets: { SOSO_API_KEY: !!env.SOSO_API_KEY, DESK_KEY: !!env.DESK_KEY, PAYER_KEY: !!env.PAYER_KEY },
        exec_net: env.EXEC_NET, kill: env.KILL === "1", desk_address: DESK_ADDR, pay_to: PAY_TO, price_usd: PRICE_USD, network: NETWORK, last_run: last,
      });
    }
    if (u.pathname === "/admin/run" && req.method === "POST") {
      if (!env.ADMIN_TOKEN || req.headers.get("authorization") !== "Bearer " + env.ADMIN_TOKEN) return json({ error: "forbidden" }, 403);
      try { const force = {}; for (const kv of (u.searchParams.get("force") || "").split(",")) { const [k, v] = kv.split(":"); if (["BTC", "ETH"].includes(k) && ["LONG", "SHORT"].includes(v)) force[k] = v; }
        return json({ ok: true, out: await runCycle(env, Date.now(), "test", force) }); } catch (e) { return json({ ok: false, error: String(e.stack ?? e).slice(0, 600) }, 500); }
    }
    if (u.pathname === "/admin/reconcile" && req.method === "POST") {
      if (!env.ADMIN_TOKEN || req.headers.get("authorization") !== "Bearer " + env.ADMIN_TOKEN) return json({ error: "forbidden" }, 403);
      await reconcile(env);
      return json({ ok: true });
    }
    const m = u.pathname.match(/^\/call\/(BTC|ETH)$/);
    if (m && req.method === "GET") return paidCall(req, env, m[1]);
    return json({ error: "not found" }, 404);
  },
  async scheduled(ev, env, ctx) {
    ctx.waitUntil(
      runCycle(env).catch((e) =>
        env.DB.prepare(`INSERT INTO runs (ts,kind,ok,detail) VALUES (?,?,?,?)`).bind(Date.now(), "cycle", 0, String(e.stack ?? e).slice(0, 500)).run(),
      ),
    );
  },
};
