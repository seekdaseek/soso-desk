// Buys one /call/<asset> from the live Worker with the bot wallet. Prints the call and the settlement tx only.
import fs from "node:fs";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
const k = "0x" + fs.readFileSync(process.env.SODEX_MASTER_KEYFILE, "utf8").trim().replace(/^0x/, "");
const client = new x402Client();
registerExactEvmScheme(client, { signer: privateKeyToAccount(k) });
const pay = wrapFetchWithPayment(fetch, client);
const asset = process.argv[2] ?? "BTC";
const r = await pay(`https://soso-desk.ochinimus.workers.dev/call/${asset}`);
console.log("status", r.status);
const settle = new x402HTTPClient(client).getPaymentSettleResponse((n) => r.headers.get(n));
console.log("settle", JSON.stringify({ success: settle.success, tx: settle.transaction, payer: settle.payer, network: settle.network }));
const b = await r.json();
console.log(JSON.stringify({ asset: b.asset, call: b.call, size: b.size, stop: b.stop, mark: b.mark, status: b.status, reasons: b.reasons }, null, 1));
