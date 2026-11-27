import fs from "node:fs";
import { openWithStop } from "../src/executor.js";
const mk = "0x" + fs.readFileSync(process.env.SODEX_MASTER_KEYFILE, "utf8").trim().replace(/^0x/, "");
const owner = "0xB96c536A2b01584c5Dd8967AF0d8Ba97eBC2417F";
const mark = Number((await (await fetch("https://testnet-gw.sodex.dev/api/v1/perps/markets/mark-prices?symbol=BTC-USD")).json()).data[0].markPrice);
const r = await openWithStop({ net: "testnet", accountID: 60656, owner, signerKey: mk, symbol: "BTC-USD", side: "LONG", notionalUsd: 10, stopPx: mark * 0.97, tag: "t" + Date.now().toString(36) });
console.log(JSON.stringify(r, null, 1));
