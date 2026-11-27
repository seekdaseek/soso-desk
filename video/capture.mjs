// Live captures for the video, then one 1920x1080 frame per script line (screenshot + caption).
//   node video/capture.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(readFileSync(`${dir}/script.json`, "utf8")).lines;
const F = JSON.parse(readFileSync(`${dir}/facts.json`, "utf8"));
mkdirSync(`${dir}/shots`, { recursive: true });
mkdirSync(`${dir}/frames`, { recursive: true });
const SITE = "https://soso-desk.ochinimus.workers.dev";
const BS = "https://base.blockscout.com/tx/";

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1.5, colorScheme: "light", locale: "en-US" });
const log = {};

async function mark(page, needles) {
  return page.evaluate((needles) => {
    const found = {};
    for (const n of needles) {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node; found[n] = false;
      while ((node = w.nextNode())) {
        if (!node.textContent.includes(n)) continue;
        const el = node.parentElement;
        if (!el || el.getClientRects().length === 0) continue;
        el.style.outline = "4px solid #e5392b"; el.style.outlineOffset = "3px"; el.style.borderRadius = "4px";
        found[n] = true; el.scrollIntoView({ block: "center" });
        break;
      }
    }
    return found;
  }, needles);
}

async function shot(name, fn) {
  const page = await ctx.newPage();
  try {
    const marks = await fn(page);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/shots/${name}.png` });
    const text = await page.evaluate(() => document.body.innerText);
    writeFileSync(`${dir}/shots/${name}.txt`, text);
    log[name] = { ok: true, marks };
  } catch (e) {
    await page.screenshot({ path: `${dir}/shots/${name}-FAIL.png` }).catch(() => {});
    log[name] = { ok: false, error: String(e).slice(0, 300) };
  }
  console.log(name, JSON.stringify(log[name]));
  await page.close();
}

await shot("page", async (p) => {
  await p.goto(SITE, { waitUntil: "networkidle" });
  await p.getByText("scheduled calls made").first().waitFor({ timeout: 30000 });
  return {};
});

await shot("call", async (p) => {
  await p.goto(SITE, { waitUntil: "networkidle" });
  await p.getByText("Test runs").first().waitFor({ timeout: 30000 });
  await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  const needle = `${F.cluster_musd.toFixed(2)} M USD at ${F.cluster_px}`;
  return mark(p, [needle]);
});

for (const [name, tx] of [["heat", F.heatmap_tx], ["calltx", F.call_tx]]) {
  await shot(name, async (p) => {
    await p.goto(BS + tx, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByText("Success").first().waitFor({ timeout: 45000 });
    await p.waitForTimeout(4000);
    await p.evaluate(() => {
      document.querySelectorAll("img, iframe, video, canvas, a").forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width >= 500 && r.height <= 130 && r.height > 20) (e.closest("a") || e).style.display = "none";
      });
      document.querySelectorAll("*").forEach((e) => { if (e.children.length === 0 && e.textContent.trim() === "Sponsored") { const row = e.closest("div"); if (row) { row.style.visibility = "hidden"; } } });
    });
    return mark(p, ["Success"]);
  });
}

async function card(name, tx) {
  const rpc = await fetch("https://base-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [tx] }) });
  const rc = (await rpc.json()).result;
  const T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const lg = rc.logs.find((l) => l.address.toLowerCase() === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" && l.topics[0] === T);
  const addr = (t) => "0x" + t.slice(26);
  const info = { status: rc.status === "0x1" ? "success" : "failed", block: parseInt(rc.blockNumber, 16), from: addr(lg.topics[1]), to: addr(lg.topics[2]), usdc: Number(BigInt(lg.data)) / 1e6 };
  writeFileSync(`${dir}/shots/${name}-card.json`, JSON.stringify(info, null, 1));
  const page = await ctx.newPage();
  await page.setContent(`<body style="margin:0;background:#0d1117;color:#d6dde6;font:25px/1.55 Menlo,monospace;padding:34px 44px;width:900px">
<div style="color:#8b98a8;font-size:21px">Receipt read from a Base node</div>
<div style="margin:12px 0;font-size:21px;word-break:break-all">tx ${tx}</div>
<div>status <b style="color:#3fb950">${info.status}</b> · block ${info.block}</div>
<div style="margin-top:14px;color:#8b98a8">USDC Transfer</div>
<div>from <b>${info.from}</b></div><div>to <b>${info.to}</b></div>
<div id="amt">amount <b style="color:#ffa657">${info.usdc} USDC</b></div></body>`);
  await page.locator("#amt").evaluate((e) => { e.style.outline = "4px solid #e5392b"; e.style.outlineOffset = "4px"; });
  await page.screenshot({ path: `${dir}/shots/${name}-card.png` });
  log[name + "_card"] = info;
  console.log(name + "_card", JSON.stringify(info));
  await page.close();
}
await card("heat", F.heatmap_tx);
await card("calltx", F.call_tx);

await shot("402", async (p) => {
  const r = await fetch(`${SITE}/call/BTC`);
  const h = r.headers.get("payment-required");
  const pr = JSON.parse(Buffer.from(h, "base64").toString());
  const html = `<body style="margin:0;background:#0d1117;color:#d6dde6;font:22px/1.5 Menlo,monospace;padding:36px 48px">
<div style="color:#8b98a8">$ curl -i ${SITE}/call/BTC</div>
<div style="margin:14px 0"><b style="color:#ff7b72">HTTP/2 ${r.status}</b> Payment Required</div>
<div style="color:#8b98a8">payment-required: (decoded)</div>
<pre id="pr" style="margin:6px 0;white-space:pre-wrap">${JSON.stringify(pr, null, 2).replace(/</g, "&lt;")}</pre></body>`;
  await p.setContent(html);
  log["402_status"] = r.status;
  writeFileSync(`${dir}/shots/402-decoded.json`, JSON.stringify(pr, null, 1));
  return mark(p, ["20000", "eip155:8453", "0x22DB3A9686EE5261e7Bf3ed4f91277232E8076e6"]);
});

await shot("orders", async (p) => {
  if (F.desk_order) {
    await p.goto(SITE, { waitUntil: "networkidle" });
    await p.getByText("Test runs").first().waitFor({ timeout: 30000 });
    await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    return mark(p, [F.desk_order.entry]);
  }
  await p.goto(`file://${dir}/../deck/.deck-filled.html`);
  const s = p.locator(".s").nth(6);
  await s.scrollIntoViewIfNeeded();
  await p.addStyleTag({ content: ".s{margin:0}body{background:#f6f5f1}" });
  await p.evaluate(() => document.querySelectorAll(".s").forEach((e, i) => { if (i !== 6) e.style.display = "none"; }));
  return mark(p, ["3347771819", "3347773873"]);
});
await browser.close();

// frames
const b2 = await chromium.launch({ channel: "chrome" });
const fp = await b2.newPage({ viewport: { width: 1920, height: 1080 } });
for (const l of S) {
  const img = readFileSync(`${dir}/shots/${l.scene}.png`).toString("base64");
  let cardImg = null;
  try { cardImg = readFileSync(`${dir}/shots/${l.scene}-card.png`).toString("base64"); } catch {}
  const esc = l.caption.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  await fp.setContent(`<body style="margin:0;width:1920px;height:1080px;background:#0e0f0c;font-family:-apple-system,Helvetica,Arial,sans-serif">
<div style="height:810px;display:flex;align-items:center;justify-content:center;gap:24px"><img src="data:image/png;base64,${img}" style="${cardImg ? "max-width:900px" : "max-width:1760px"};max-height:780px;border-radius:10px;box-shadow:0 8px 40px #0008">${cardImg ? `<img src="data:image/png;base64,${cardImg}" style="max-width:820px;max-height:780px;border-radius:10px;box-shadow:0 8px 40px #0008">` : ""}</div>
<div style="height:270px;padding:18px 90px;color:#f2f1ea;font-size:35px;line-height:1.38;display:flex;align-items:center">${esc}</div></body>`);
  await fp.screenshot({ path: `${dir}/frames/${l.id}.png` });
}
await b2.close();
writeFileSync(`${dir}/shots/capture-log.json`, JSON.stringify(log, null, 1));
