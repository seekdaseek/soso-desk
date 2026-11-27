import { chromium } from "playwright";
import path from "node:path"; import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`file://${dir}/.deck-filled.html`);
const n = await p.locator(".s").count();
for (const i of [4, 5, 6]) await p.locator(".s").nth(i).screenshot({ path: `/private/tmp/slide${i + 1}.png` });
console.log("slides", n); await b.close();
