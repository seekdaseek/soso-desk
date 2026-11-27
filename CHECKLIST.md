# CHECKLIST, soso desk, SoSoValue W3. Answered Nov 23 2026 against RESEARCH-sosovalue-waves and the decision note.

Each line says what the research found, what we have, and whether it holds. Status is as of the live page, not as hoped.

## What wins, in the judges' words

| # | What wins | What we have | Holds? |
|---|---|---|---|
| 1 | SoSoValue data decides the action | ETF net flows and hot news set the score. Macro events only halve the size. The score decides LONG, SHORT or FLAT. | Yes, three SoSoValue modules feed the verdict |
| 2 | Real SoDEX orders with order IDs, mainnet best | Signed market order and reduce-only stop on testnet, IDs 3347771819 and 3347773873. No desk order yet, because every read so far was FLAT. Mainnet off. | Partly. Real IDs exist, but they come from a signing test, not from a desk call |
| 3 | A risk engine | Cluster no-entry band, stop beyond the cluster, one position per asset, daily loss stop, kill switch, 12 reads a day, 0.20 USDC hard stop. Human approval before mainnet is a rule, mainnet is off. | Yes on testnet |
| 4 | Proof judges can click | Public ledger, every payment with a Base tx hash, tests shown and excluded, judge guide on the page, /diag, /api/ledger. No hit rate yet. | Mostly. Hit rate is n/a until calls are LONG or SHORT |
| 5 | One user, one job | An agent or trader buys a BTC or ETH call for 2 cents. | Yes |
| 6 | Not a twin | See the twin table below. | Partly |

## What lost, and whether we avoid it

| Loser | Us |
|---|---|
| No repo, no live demo, only an X link | Live Worker is up. Repo exists locally and is NOT yet public. Must be public before submit. |
| Live demo with no data at review time | Cron runs every 4 hours and the page reads the ledger, so data is there. Needs the SoSoValue key to stay valid, it is set as a Worker secret. |
| A display layer with no visible logic | Rules are written in the README and tested, reasons are on every call. |
| Simulated SoDEX execution or payload preview | Nothing simulated. The page says when there is no order. |
| Generic Telegram bot or CoinGecko data | Not a bot. Data is SoSoValue and AgentFeed. |
| Analytics that read like a trading journal | The product is a call and its price, not a journal. |

## Twins

| Entry | Overlap | Our difference |
|---|---|---|
| Edgework | Pre-trade verdict with a suggested size | It scores your own history. We sell the call itself, per call, to an agent. |
| earlynotwrong | Real SoDEX orders, macro pause, SSI scoring, a paid MCP of its decision history | See the twin facts below. Our three differences: pay per call over x402 in USDC with a public paid-call ledger, entries and stops placed around liquidation clusters, real order IDs with losses shown. |
| AegisAgent | An x402 subscription on Celo Sepolia | A subscription, not a per-call price. See the twin facts below. |
| ETFSignal AI | ETF flow signals into SoDEX | We add the cluster gate and the paid route. |
| LiqSentry | Liquidation, 10 pts in W1 | It is a monitor. We use clusters to gate entries and place stops. |

Twin check was incomplete for sonar, Helix, Mosaic and ETFSignal AI, I did not read their reviews.

### Twin facts, AKINDO board, first read Nov 22 and re-read live Nov 23

- A board search for x402 returns 2 products: earlynotwrong and AegisAgent. Kinetic showed up in my first, broader search, which also matches update text, and does not match x402. I did not open Kinetic's repo or page.
- earlynotwrong: 6 votes, W3 totals 48, 44, 49, 48, 41, so 48 on user value and about 7.7 out of 10 overall, call it 8. Its update text says real EIP-712 orders on SoDEX, a macro pause on CPI, FOMC and NFP, SSI basket scoring, and decision history exposed as a paid MCP service for other agents. 0 points and 0 USDC so far.
- AegisAgent: 6 votes, W3 totals 40, 35, 41, 43, 37, about 6.5 to 6.6 out of 10. The 14 on its card is a different counter, not the vote count. Its own W3 update text quotes the x402 subscription smart contract on Celo Sepolia, so that is verified from the page. It is a subscription, not a per-call price. 0 points and 0 USDC so far.
- Correction to what I wrote on Nov 23: I had read the 14 as the vote count and divided by it, and I had given AegisAgent totals of 107, 87, 107, 109, 96. Those were wrong. The numbers above come from a live re-read on Nov 23, which also matches your figures.

- What this means: the claim that nobody sells per call over x402 does not hold. Both entries touch it. The defensible gap is a per-call USDC price with a public paid-call ledger tagged by self and outside, plus cluster-gated entries and stops. Outside payers is still 0 for us, so that gap is not yet proven.

## Practical gates

| Gate | State |
|---|---|
| SoDEX testnet access | Done. Faucet claimed in code, 100 vUSDC. |
| SoDEX API key registration | Failed on testnet in every variant tried. Orders are signed directly by the bot wallet, which the docs allow but do not recommend. |
| SoDEX mainnet | Off. Needs a 5 USDC deposit and his yes. |
| SoSoValue quota | Docs say 100,000 per month and 20 per minute. The console showed 10,000 units and 100 per minute. We use about 24 calls a day. |
| Minimum order | SoDEX needs 10 USD, so the 5 USD cap cannot be kept. Testnet only at about 10.5 USD. |
| Late entry eligibility | Unconfirmed. The board shows W3 at 0 points for all 114 entries, and our question there is unanswered. |

## Submission format

| Item | State |
|---|---|
| Project overview | In README and the page |
| Public GitHub repo with README | README written. Repo not public yet. |
| Public live demo | https://soso-desk.ochinimus.workers.dev |
| Video | Built, 1:52, local voice. Not uploaded. YouTube upload is his call. |
| Wave progress update | WAVE3-UPDATE-final.txt |
| Team info | Needed on the form, not in the repo. No legal name goes in the repo. |

## Liveness

The Worker, cron and database must stay up until Nov 30 16:59. The bot wallet needs USDC above 0.20 for cluster reads. At 1.42 USDC it covers about 60 reads.

## Money

At W2 rates the pool pays about 36 USDC a point. A new entry against three-wave products, if judged, would land at 1 to 3 points, roughly 36 to 108 USDC. Zero if late entries are not judged. The desk's own running cost so far is about 0.08 USDC.

## Before submit, in order

1. Refresh deck, video and docs on Nov 25 so they show real cron rows: `node deck/build.mjs`, `node video/build-script.mjs`, capture, render, `node scripts/update-docs.mjs`.
2. Confirm at least one scheduled call and, if any is LONG or SHORT, its order IDs are on the page.
3. Make the repo public, then upload the video. Both need his yes.
4. He submits on Nov 27 on his yes. Nothing is submitted by me.

Verdict: GO only as a small bet. The product is real and honest, but the strongest rubric items, desk orders with IDs and an outside payer, are not in hand.
