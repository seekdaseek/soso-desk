# soso desk

**soso desk sells a BTC and ETH call for 2 cents over x402 and shows every result on one public page, losses included.**

Live: https://soso-desk.ochinimus.workers.dev

<!-- live:start -->
Read 2026-11-27 07:52 UTC from the live ledger: 52 scheduled calls made, 26 of them FLAT, 26 LONG or SHORT, 3 desk orders sent, 0 outside payers. 14 manual test runs are kept out of every count.
<!-- live:end -->

One user: an AI agent or a trader who wants a BTC or ETH call with a reason and a track record. One price: 2 cents of USDC per call.

## What it does

Every 4 hours the desk makes one call per asset: LONG, SHORT or FLAT, with a size, a stop and three cited reasons.

| Input | Source | Use |
|---|---|---|
| Spot ETF net flows, last 5 days | SoSoValue | direction and consistency score, -2 to +2 |
| Hot news, counted per asset | SoSoValue | bullish against bearish, -1 to +1 |
| Liquidation clusters | AgentFeed heatmap, bought by the desk for 2 cents | no entry with a big cluster within 1.5 percent of the price, stop 0.3 percent beyond the nearest big cluster inside 4 percent |
| Macro events, next 48 hours | SoSoValue | a big print halves the size, never a headline |

Two points of lean or more makes a LONG or SHORT. Anything else is FLAT. A missing input is named on the page and the desk stays out, it never guesses. The rules are in `src/engine.js` and covered by 10 tests.

## Judge steps, 60 seconds

1. Open the live page. No wallet needed. The banner says whether any real SoDEX order exists.
2. Read the Calls table. Open a call to see its reasons, each with the number it rests on.
3. Check the Payments table. A row tagged `self` is the desk buying cluster data from its own provider. A row tagged `outside` is a buyer of a call, with a Base transaction hash.
4. Open the section on test runs. Manual runs made while building are listed there with their transactions and are in no count.
5. `GET /call/BTC` answers 402 with the payment terms: 20000 base units of USDC on Base. `/diag` shows what is configured, with no secrets. `/api/ledger` is the raw data behind every number.

## Orders

Orders are signed EIP-712 messages sent to SoDEX. Nothing is simulated: where the desk has no order the page says why.

- Testnet only. Mainnet is off.
- SoDEX needs at least 10 USD per order on BTC and ETH, so testnet orders use about 10.5 USD.
- Every entry is followed by a reduce-only stop. One position per asset, a daily loss stop, and a kill switch in the environment.
- The signing path was proven with a signed market order and a stop, order IDs 3347771819 and 3347773873.

## Money

- A call costs 2 cents of USDC on Base, paid to the AgentFeed treasury.
- The desk spends about 2 cents per cluster read. It reads clusters only when flows already lean, at most 12 times a day, and stops when its wallet drops below 0.20 USDC.
- Every payment the desk makes to itself or to its provider is tagged `self` and never counted as an outside payer.

## Run it

```
npm install
npm test
node deck/build.mjs        # deck from the live ledger
node video/build-script.mjs && node video/capture.mjs && node video/render.mjs
```

The Worker is one file, `src/worker.js`, with a cron every 4 hours and a D1 database (`schema.sql`). Secrets are set with `wrangler secret put` and are never in the repository.

## Not done

- No outside buyer yet.
- No mainnet order.
- No hit rate until calls are LONG or SHORT and graded.
