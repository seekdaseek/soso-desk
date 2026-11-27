// Testnet one-off: register a trading API key for the bot wallet and move vUSDC spot -> perps.
// Master key is read from a file path in SODEX_MASTER_KEYFILE. Nothing secret is printed.
import fs from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { NETS, nextNonce, signAddApiKey, signedRequest, get } from "../src/sodex.js";

const net = "testnet";
const read = (p) => { let k = fs.readFileSync(p, "utf8").trim(); return k.startsWith("0x") ? k : "0x" + k; };
const masterKey = read(process.env.SODEX_MASTER_KEYFILE);
const master = privateKeyToAccount(masterKey);
const state = await get(net, `/perps/accounts/${master.address}/state`);
const accountID = state.data.aid;
const keyFile = new URL("../.secrets/sodex-testnet-apikey.json", import.meta.url);
const name = "desk-w3";

let rec = fs.existsSync(keyFile) ? JSON.parse(fs.readFileSync(keyFile, "utf8")) : null;
if (!rec) {
  const k = generatePrivateKey();
  rec = { name, key: k, address: privateKeyToAccount(k).address, accountID };
  fs.writeFileSync(keyFile, JSON.stringify(rec), { mode: 0o600 });
}
const q = await get(net, `/user/${master.address}/api-keys?accountID=${accountID}&name=${name}`);
if (!JSON.stringify(q.data ?? {}).toLowerCase().includes(rec.address.toLowerCase())) {
  const nonce = nextNonce(); const EXP = nonce + 24*3600*1000;
  const sig = await signAddApiKey(masterKey, net, { accountID, name, publicKey: rec.address, expiresAt: EXP, nonce });
  const r = await fetch(`${NETS[net].host}/api/v1/user/${master.address}/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-API-Chain": String(NETS[net].chainId), "X-API-Nonce": String(nonce), "X-API-Sign": sig },
    body: JSON.stringify({ accountID, name, type: 1, publicKey: rec.address, expiresAt: EXP }),
  });
  console.log("register", r.status, (await r.text()).slice(0, 300));
}
const q2 = await get(net, `/user/${master.address}/api-keys?accountID=${accountID}&name=${name}`);
console.log("registered:", JSON.stringify(q2.data ?? q2).toLowerCase().includes(rec.address.toLowerCase()), "accountID", accountID, "key address", rec.address);

if (process.argv.includes("--fund")) {
  const amt = process.argv[process.argv.indexOf("--fund") + 1] ?? "50";
  const params = { id: nextNonce(), fromAccountID: accountID, toAccountID: 999, coinID: 0, amount: String(amt), type: 3 };
  const r = await signedRequest({ net, engine: "spot", method: "POST", path: "/accounts/transfers", type: "transferAsset", params, keyName: name, apiKey: rec.key });
  console.log("transfer", r.status, JSON.stringify(r.json).slice(0, 300));
  await new Promise(r => setTimeout(r, 4000));
  console.log("perps state", JSON.stringify((await get(net, `/perps/accounts/${master.address}/state`)).data).slice(0, 300));
}
