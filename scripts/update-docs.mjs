// Refreshes the live numbers line in README.md from the live ledger. WAVE3-UPDATE-final.txt is written by hand.
//   node scripts/update-docs.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const L = await (await fetch("https://soso-desk.ochinimus.workers.dev/api/ledger")).json();
const s = L.stats;
const when = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

// README live block
let readme = readFileSync(`${root}/README.md`, "utf8");
const live = `<!-- live:start -->
Read ${when} from the live ledger: ${s.calls} scheduled calls made, ${s.flat} of them FLAT, ${s.directional} LONG or SHORT, ${s.orders} desk orders sent, ${s.outside_paid} outside payers. ${s.tests_excluded} manual test runs are kept out of every count.
<!-- live:end -->`;
readme = readme.replace(/<!-- live:start -->[\s\S]*<!-- live:end -->/, () => live);
writeFileSync(`${root}/README.md`, readme);

console.log("README refreshed", when, JSON.stringify(s));
