CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL, asset TEXT NOT NULL, side TEXT NOT NULL, size REAL, stop REAL, mark REAL,
  notional_usd REAL, scores TEXT, reasons TEXT, inputs TEXT, flat_why TEXT,
  cluster_status TEXT,            -- 'paid-self' | 'unavailable'
  hm_tx TEXT, hm_error TEXT, wb_before REAL,
  trig TEXT DEFAULT 'real',       -- 'real' (cron) | 'test' (manual run, left out of every count)
  net TEXT,                       -- 'testnet' | 'mainnet' | null
  entry_order_id TEXT, entry_cl_id TEXT, entry_px REAL, qty REAL,
  stop_order_id TEXT, stop_cl_id TEXT, exec_error TEXT,
  status TEXT DEFAULT 'none',     -- none | open | closed | failed
  closed_ts INTEGER, exit_px REAL, pnl REAL
);
CREATE INDEX IF NOT EXISTS calls_ts ON calls(ts);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL, kind TEXT NOT NULL,   -- 'self' (desk paying AgentFeed) | 'outside' (a buyer paying the desk)
  route TEXT, payer TEXT, tx TEXT, network TEXT, amount_usd REAL, call_id INTEGER, trig TEXT DEFAULT 'real'
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, kind TEXT, ok INTEGER, detail TEXT
);
