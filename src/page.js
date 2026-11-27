export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>soso desk</title>
<style>
:root{--bg:#f6f5f1;--fg:#16150f;--mut:#6b6a60;--card:#fff;--line:#dedcd2;--up:#0b7a43;--dn:#b3261e;--acc:#1b3a8a}
@media (prefers-color-scheme:dark){:root{--bg:#121310;--fg:#ecebe3;--mut:#9a998d;--card:#1b1c18;--line:#34352d;--up:#4cc48a;--dn:#ff7b72;--acc:#8fb0ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:28px;margin:0 0 6px;letter-spacing:-.02em}h2{font-size:17px;margin:28px 0 10px}
p{margin:6px 0}.mut{color:var(--mut)}a{color:var(--acc)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:16px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.stat b{display:block;font-size:24px}.stat span{color:var(--mut);font-size:12px}
.banner{border:1px solid var(--line);border-left:4px solid var(--acc);background:var(--card);border-radius:8px;padding:10px 12px;margin:12px 0}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--mut);font-weight:600}
.wrap{overflow-x:auto}.LONG{color:var(--up);font-weight:700}.SHORT{color:var(--dn);font-weight:700}.FLAT{color:var(--mut);font-weight:700}
code{font:12px ui-monospace,monospace;word-break:break-all}.tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:0 8px;font-size:11px;color:var(--mut)}
ol li{margin:4px 0}details{margin:4px 0}summary{cursor:pointer;color:var(--acc)}
</style></head><body><main>
<h1>soso desk</h1>
<p>A BTC and ETH call every 4 hours with a size, a stop and cited reasons. An agent pays 2 cents per call in USDC over x402. The desk trades its own calls on SoDEX and shows every result, losses included.</p>
<div id="banner" class="banner">Loading…</div>
<div class="grid" id="stats"></div>

<h2>Judge guide, 60 seconds</h2>
<ol>
<li>Read the latest calls below. No wallet needed, this is live data from the cron that runs every 4 hours.</li>
<li>Open a call's reasons. Each reason cites a number from SoSoValue ETF flows or hot news, or from the liquidation clusters.</li>
<li>Check the Orders column. A real order ID means the desk sent a signed SoDEX order. An empty cell says why.</li>
<li>Open the Payments table. Rows tagged <span class="tag">self</span> are the desk buying cluster data from AgentFeed. Rows tagged <span class="tag">outside</span> are buyers of a call, each with a Base transaction hash.</li>
<li>Try the paid route: <code>GET /call/BTC</code> answers 402 with the payment terms. <a href="/diag">/diag</a> shows what is configured, with no secrets.</li>
</ol>

<h2>Calls</h2><div class="wrap"><table><thead><tr><th>Time (UTC)</th><th>Asset</th><th>Call</th><th>Size</th><th>Stop</th><th>Reasons</th><th>Orders</th><th>Result</th></tr></thead><tbody id="calls"></tbody></table></div>
<h2>Payments</h2><div class="wrap"><table><thead><tr><th>Time (UTC)</th><th>Kind</th><th>Route</th><th>USD</th><th>Tx</th></tr></thead><tbody id="pays"></tbody></table></div>

<h2>Test runs, left out of every count</h2>
<p class="mut">Manual runs made while building, with the real payments they caused. They are shown so nothing is hidden and are not in any number above.</p>
<div class="wrap"><table><thead><tr><th>Time (UTC)</th><th>Item</th><th>Detail</th><th>Tx</th></tr></thead><tbody id="tests"></tbody></table></div>
<h2>Sources</h2>
<p class="mut">Inputs: <a href="https://sosovalue.gitbook.io/soso-value-api-doc">SoSoValue API</a> (spot ETF net flows, hot news, macro events), AgentFeed <a href="https://x402.ochinimus.app/api/sample/liq-heatmap">liquidation heatmap</a>. Orders: <a href="https://docs.sodex.com">SoDEX</a>. Raw ledger: <a href="/api/ledger">/api/ledger</a>. Rules and code: see the README in the repository.</p>
</main>
<script>
const $=(i)=>document.getElementById(i);
const el=(t,txt,cls)=>{const e=document.createElement(t);if(txt!=null)e.textContent=txt;if(cls)e.className=cls;return e};
const fmt=(ts)=>new Date(ts).toISOString().slice(0,16).replace('T',' ');
function stat(b,s,href){const d=el('div',null,'stat');const bb=el('b',b);if(href){const a=el('a',null);a.href=href;a.appendChild(bb);d.appendChild(a)}else d.appendChild(bb);d.appendChild(el('span',s));$('stats').appendChild(d)}
fetch('/api/ledger').then(r=>r.json()).then(L=>{
  $('banner').textContent=L.orders_note;
  const s=L.stats;
  stat(String(s.calls),'scheduled calls made','/api/ledger');
  stat(String(s.flat),'FLAT, the desk stayed out','/api/ledger');
  stat(String(s.directional),'LONG or SHORT calls','/api/ledger');
  stat(s.hit_rate==null?'n/a':Math.round(s.hit_rate*100)+'%','direction hit rate over '+s.graded+' graded','/api/ledger');
  stat(String(s.orders),'real SoDEX order IDs','/api/ledger');
  stat(String(s.outside_paid),'calls bought by outside payers','/api/ledger');
  stat('$'+s.self_spend.toFixed(2),'desk spend on cluster data (self)','/api/ledger');
  const tb=$('calls');
  for(const c of L.calls){
    const tr=el('tr');tr.appendChild(el('td',fmt(c.ts)));tr.appendChild(el('td',c.asset));tr.appendChild(el('td',c.side,c.side));
    tr.appendChild(el('td',c.side==='FLAT'?'':String(c.size)));tr.appendChild(el('td',c.stop?String(c.stop):''));
    const td=el('td');const d=document.createElement('details');d.appendChild(el('summary',c.side==='FLAT'?(c.flat_why||'flat'):'3 reasons'));
    for(const r of c.reasons)d.appendChild(el('p',r));td.appendChild(d);tr.appendChild(td);
    const o=el('td');
    if(c.entry_order_id){o.appendChild(el('div','entry '+c.entry_order_id));if(c.stop_order_id)o.appendChild(el('div','stop '+c.stop_order_id));o.appendChild(el('div',c.net,'mut'))}
    else o.appendChild(el('span',c.exec_error||(c.side==='FLAT'?'':'no order'),'mut'));tr.appendChild(o);
    const r=el('td');
    if(c.status==='closed')r.textContent='closed, P&L '+(c.pnl==null?'n/a':c.pnl.toFixed(4)+' USD, balance change after fees');else if(c.status==='open')r.textContent='open';else if(c.grade)r.textContent='direction '+c.grade;else r.textContent='';
    tr.appendChild(r);tb.appendChild(tr);
  }
  const pb=$('pays');
  if(!L.payments.length){const tr=el('tr');const td=el('td','No payments yet.');td.colSpan=5;tr.appendChild(td);pb.appendChild(tr)}
  for(const p of L.payments){const tr=el('tr');tr.appendChild(el('td',fmt(p.ts)));const k=el('td');k.appendChild(el('span',p.kind,'tag'));tr.appendChild(k);tr.appendChild(el('td',p.route));tr.appendChild(el('td','$'+Number(p.amount_usd).toFixed(3)));
    const t=el('td');if(p.tx){const a=el('a',p.tx.slice(0,12)+'…');a.href='https://basescan.org/tx/'+p.tx;t.appendChild(a)}tr.appendChild(t);pb.appendChild(tr)}
  const tt=$('tests');
  for(const c of L.tests){const tr=el('tr');tr.appendChild(el('td',fmt(c.ts)));tr.appendChild(el('td','call '+c.asset+' '+c.side+(c.entry_order_id?' | order '+c.entry_order_id+', stop '+c.stop_order_id+(c.pnl!=null?', P&L '+c.pnl:''):'')));tr.appendChild(el('td',(c.flat_why||'')+(c.reasons[2]?' | '+c.reasons[2]:'')));tr.appendChild(el('td',''));tt.appendChild(tr)}
  for(const p of L.test_payments){const tr=el('tr');tr.appendChild(el('td',fmt(p.ts)));tr.appendChild(el('td','payment '+p.kind+' '+p.route));tr.appendChild(el('td','$'+Number(p.amount_usd).toFixed(3)));const t=el('td');if(p.tx){const a=el('a',p.tx.slice(0,12)+'…');a.href='https://basescan.org/tx/'+p.tx;t.appendChild(a)}tr.appendChild(t);tt.appendChild(tr)}
}).catch(e=>{$('banner').textContent='Ledger failed to load: '+e})
</script></body></html>`;
