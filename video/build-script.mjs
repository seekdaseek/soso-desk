// Builds script.json and facts.json from the live ledger. Every number in the script comes from here.
//   node video/build-script.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const L = await (await fetch("https://soso-desk.ochinimus.workers.dev/api/ledger")).json();

const real = L.calls.find((c) => c.asset === "BTC");
const call = real ?? L.tests.find((c) => c.asset === "BTC");
const isReal = !!real;
if (!call) throw new Error("no BTC call in the ledger");
const clusterLine = call.reasons.find((r) => r.startsWith("Liquidation cluster"));
const m = clusterLine?.match(/cluster of ([\d.]+) M USD at (\d+), ([\d.]+) percent/);
if (!m) throw new Error("latest BTC call has no cluster reason, pick another call: " + call.reasons.join(" | "));
const etfLine = call.reasons[0];
const e = etfLine.match(/: (-?\d+) M USD, (\d) of (\d) days/);
const hmTx = call.hm_tx;
const pay = [...L.payments, ...L.test_payments];
const callPay = pay.find((p) => p.route === "/call/BTC");
if (!hmTx || !callPay) throw new Error("missing heatmap tx or paid call tx");

// A desk order on a real call replaces the signing-test line. DESK_ORDER_FROM_TESTS=1 rehearses it on a test row.
const pool = process.env.DESK_ORDER_FROM_TESTS ? [...L.calls, ...L.tests] : L.calls;
const ordered = pool.find((c) => c.entry_order_id && c.side !== "FLAT");
const desk_order = ordered ? { asset: ordered.asset, side: ordered.side, entry: ordered.entry_order_id, stop: ordered.stop_order_id, status: ordered.status, pnl: ordered.pnl, real: !process.env.DESK_ORDER_FROM_TESTS } : null;
const facts = {
  desk_order,
  built_at: new Date().toISOString(),
  call_is_real_cron_row: isReal,
  call_ts: call.ts, side: call.side, mark: call.mark,
  etf_musd: Number(e[1]), etf_pos: Number(e[2]), etf_days: Number(e[3]),
  cluster_musd: Number(m[1]), cluster_px: Number(m[2]), cluster_pct: Number(m[3]),
  band_pct: 1.5, price_usd: 0.02,
  heatmap_tx: hmTx, call_tx: callPay.tx,
  real_calls: L.stats.calls, tests_excluded: L.stats.tests_excluded, outside_payers: L.stats.outside_paid,
};

const lines = [
  { id: "L1", scene: "page",
    caption: "soso desk: one BTC and one ETH call every 4 hours, LONG, SHORT or FLAT, with a size, a stop and three reasons. 2 cents in USDC per call.",
    say: "This is soso desk. Every four hours it makes one call on Bitcoin and one on Ether. Long, short, or flat, with a size, a stop, and three reasons. An agent pays two cents in USDC for a call." },
  { id: "L2", scene: "call",
    caption: `Latest BTC call${isReal ? "" : " (a test run, not counted)"}: ${facts.side}. ETF net flow ${facts.etf_musd} M USD over ${facts.etf_days} days, but a ${facts.cluster_musd} M USD liquidation cluster sits ${facts.cluster_pct} percent from the price, inside the ${facts.band_pct} percent band.`,
    say: `Here is the latest Bitcoin call. ${facts.side === "FLAT" ? "Flat" : facts.side}. ETF flows leaned short: minus ${Math.abs(facts.etf_musd)} million dollars over ${facts.etf_days} days. But a liquidation cluster of ${facts.cluster_musd} million dollars sits ${facts.cluster_pct} percent from the price, inside the one and a half percent band. So the desk stays out, and says why.` },
  { id: "L3", scene: "heat",
    caption: "The cluster data is bought: 2 cents in USDC on Base, from the desk's own wallet to AgentFeed. Tagged self on the ledger, never counted as a customer.",
    say: "That cluster data is bought, not free. The desk pays AgentFeed two cents in USDC on Base, from its own wallet. This is that payment. It is tagged self on the ledger, so it never counts as a customer." },
  { id: "L4", scene: "402",
    caption: "Ask the call route without paying and the server answers HTTP 402. The quote: 20000 base units of USDC, 2 cents, on Base, to the AgentFeed treasury.",
    say: "Now the product. Ask the call route without paying, and the server answers H T T P four oh two, payment required. The quote is two cents of USDC on Base, to the AgentFeed treasury." },
  { id: "L5", scene: "calltx",
    caption: "Pay it and the same request returns the call, with a settlement receipt. This transaction was bought by our own wallet, so it is a test, outside every count.",
    say: "Pay it, and the same request returns the call, with a settlement receipt. Here is that transaction on Base. Our own wallet bought it, so it is a test, and the ledger keeps it out of every count." },
  { id: "L6", scene: "orders", ...(desk_order ? {
    caption: `A desk call went ${desk_order.side} on ${desk_order.asset}: SoDEX testnet order ${desk_order.entry}, with its stop ${desk_order.stop}. ${desk_order.status === "closed" ? "Closed, P&L " + (desk_order.pnl ?? "n/a") + " USD after fees." : "Position open."} Mainnet is off.`,
    say: `A desk call went ${desk_order.side} on ${desk_order.asset}. The order went to SoDEX testnet and came back with a real order I D, with a stop attached. ${desk_order.status === "closed" ? "The position is closed, and the result, fees included, is on the page." : "The position is open, and the result will go on the page."} Mainnet stays off. Soso desk. Calls, payments, and results, on one public page.`,
  } : {
    caption: "SoDEX testnet: a signed order and a reduce-only stop both returned real order IDs. No simulated orders. Mainnet is off.",
    say: "On SoDEX, the signing path is proven on testnet. A signed order and a reduce-only stop both returned real order I Ds. Nothing is simulated, and mainnet stays off. Soso desk. Calls, payments, and results, on one public page." }) },
];
writeFileSync(`${dir}/script.json`, JSON.stringify({ lines }, null, 1));
writeFileSync(`${dir}/facts.json`, JSON.stringify(facts, null, 1));
const wc = lines.reduce((a, l) => a + l.say.split(/\s+/).length, 0);
console.log("script words", wc, "est seconds", Math.round(wc / 2.6), "real row:", isReal);
