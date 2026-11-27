// SoDEX signing and REST helpers. Works in Node and in a Worker (viem only).
import { keccak256, toHex, concatHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const NETS = {
  testnet: { host: "https://testnet-gw.sodex.dev", chainId: 138565 },
  mainnet: { host: "https://mainnet-gw.sodex.dev", chainId: 286623 },
};
const ZERO = "0x0000000000000000000000000000000000000000";

// viem returns recovery byte 27/28, SoDEX wants 0/1.
function wireSig(sig) {
  const r = parseInt(sig.slice(-2), 16);
  return sig.slice(0, -2) + (r >= 27 ? r - 27 : r).toString(16).padStart(2, "0");
}

let lastNonce = 0;
export function nextNonce() {
  lastNonce = Math.max(Date.now(), lastNonce + 1);
  return lastNonce;
}

export async function signAddApiKey(masterKey, net, { accountID, name, publicKey, expiresAt, nonce }) {
  const master = privateKeyToAccount(masterKey);
  const sig = await master.signTypedData({
    domain: { name: "universal", version: "1", chainId: NETS[net].chainId, verifyingContract: ZERO },
    types: { AddAPIKey: [
      { name: "accountID", type: "uint64" }, { name: "name", type: "string" },
      { name: "keyType", type: "uint8" }, { name: "publicKey", type: "bytes" },
      { name: "expiresAt", type: "uint64" }, { name: "nonce", type: "uint64" } ] },
    primaryType: "AddAPIKey",
    message: { nonce: BigInt(nonce), accountID: BigInt(accountID), name, keyType: 1, publicKey, expiresAt: BigInt(expiresAt) },
  });
  return concatHex(["0x02", wireSig(sig)]);
}

// payload = {type, params}; params key order must match the server's Go structs.
export async function signAction(apiKey, net, engine, payload, nonce) {
  const acct = privateKeyToAccount(apiKey);
  const payloadHash = keccak256(toHex(JSON.stringify(payload)));
  const sig = await acct.signTypedData({
    domain: { name: engine === "perps" ? "futures" : "spot", version: "1", chainId: NETS[net].chainId, verifyingContract: ZERO },
    types: { ExchangeAction: [{ name: "payloadHash", type: "bytes32" }, { name: "nonce", type: "uint64" }] },
    primaryType: "ExchangeAction",
    message: { payloadHash, nonce: BigInt(nonce) },
  });
  return concatHex(["0x01", wireSig(sig)]);
}

export async function signedRequest({ net, engine, method, path, type, params, keyName, apiKey }) {
  const nonce = nextNonce();
  const sign = await signAction(apiKey, net, engine, { type, params }, nonce);
  const res = await fetch(`${NETS[net].host}/api/v1/${engine}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json",
      ...(keyName ? { "X-API-Key": keyName } : {}), "X-API-Sign": sign, "X-API-Nonce": String(nonce) },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { code: -1, raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

// Perps order. Field order is fixed by the server struct. Decimals are strings.
export function perpsOrderItem({ clOrdID, side, type, tif, price, quantity, reduceOnly = false, stopPrice, stopType, modifier = 1 }) {
  const o = { clOrdID, modifier, side, type, timeInForce: tif };
  if (price !== undefined) o.price = String(price);
  o.quantity = String(quantity);
  if (stopPrice !== undefined) { o.stopPrice = String(stopPrice); o.stopType = stopType; o.triggerType = 2; }
  o.reduceOnly = reduceOnly;
  o.positionSide = 1;
  return o;
}

export const get = async (net, path) => (await fetch(`${NETS[net].host}/api/v1${path}`, { headers: { Accept: "application/json" } })).json();
