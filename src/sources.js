// Data inputs. Every fetch returns {ok, data, error}; a failed input is never invented.
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const SOSO = "https://openapi.sosovalue.com/openapi/v1";
export const AGENTFEED = "https://x402.ochinimus.app";

async function jget(url, init, ms = 15000) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return { ok: false, error: `HTTP ${r.status}` };
    return { ok: true, data: j, status: r.status };
  } catch (e) {
    return { ok: false, error: String(e.message ?? e).slice(0, 120) };
  }
}

export const soso = (key) => {
  const H = { "x-soso-api-key": key };
  const call = async (p) => {
    const r = await jget(SOSO + p, { headers: H });
    if (!r.ok) return r;
    if (r.data.code !== 0) return { ok: false, error: `soso code ${r.data.code}` };
    return { ok: true, data: r.data.data };
  };
  return {
    etf: (symbol) => call(`/etfs/summary-history?symbol=${symbol}&country_code=US&limit=8`),
    news: () => call(`/news/hot?page_size=100`).then((r) => (r.ok ? { ok: true, data: r.data.list ?? [] } : r)),
    events: () => call(`/macro/events`),
  };
};

export async function markPrice(host, symbol) {
  const r = await jget(`${host}/api/v1/perps/markets/mark-prices?symbol=${symbol}`);
  const px = Number(r.data?.data?.[0]?.markPrice);
  return px > 0 ? { ok: true, data: px } : { ok: false, error: r.error ?? "no mark" };
}

// Pays AgentFeed's own /api/liq-heatmap route from the desk wallet. Always labelled "self".
export async function heatmap(deskKey, symbol) {
  const url = `${AGENTFEED}/api/liq-heatmap?symbol=${symbol}&hours=24&buckets=40`;
  try {
    const account = privateKeyToAccount(deskKey);
    const client = new x402Client();
    registerExactEvmScheme(client, { signer: account });
    const pay = wrapFetchWithPayment(fetch, client);
    const r = await pay(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return { ok: false, error: `agentfeed HTTP ${r.status}`, paid: false };
    const body = await r.json();
    let tx = null, payer = null, network = null;
    const h = r.headers.get("payment-response") ?? r.headers.get("x-payment-response");
    if (h) {
      try { const d = new x402HTTPClient(client).getPaymentSettleResponse((n) => r.headers.get(n)); tx = d.transaction; payer = d.payer; network = d.network; } catch {}
    }
    return { ok: true, data: body?.data ?? body, paid: !!h, tx, payer, network, price_usd: 0.02 };
  } catch (e) {
    return { ok: false, error: String(e.message ?? e).slice(0, 160), paid: false };
  }
}
