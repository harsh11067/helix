# PRODUCT.md — HELIX after the hackathon: Proof-of-Forecast

> The case for HELIX as a real product. Use it for the README "Where this goes" section, the blog's closing, and any judge question about long-term potential. Everything under "Today" is shipped and verifiable. Everything under "Next" is a plan, and is labeled as one.

---

## 1. The problem

Prediction markets are now a large part of crypto, and AI agents increasingly act on market signals. Neither keeps any memory of **who is actually good**:

- Venues settle a market and keep no portable record of a forecaster's judgment. Your history on one venue is useless on the next.
- Social and copy trading ranks people by PnL, which is mostly luck over small samples and is easily cherry-picked: delete the losers and screenshot the winners.
- Agents consuming signals have no standard way to ask "is this source calibrated?" before they act, let alone pay for the answer.

The missing asset is a **verifiable, portable, tamper-evident track record of judgment**, scored for calibration rather than luck.

---

## 2. The product

**HELIX turns every call into evidence, and evidence into reputation that people and agents can use.**

| Layer | Today (shipped, verifiable) | Next |
|---|---|---|
| **Capture** | Commit-reveal on Sui: a hash goes on-chain before settlement; full record in Walrus Memory on Mainnet; priced on DeepBook Predict's on-chain vol surface | Mint real positions on Predict mainnet launch day; import Polymarket history; multi-asset |
| **Score** | Settlement read on-chain via Tatum; Brier and overconfidence per voice and setup; Beta-prior posteriors; lessons once n ≥ 3 | Regime-aware calibration across venues; confidence intervals on every score |
| **Act** | Memory-driven sizing, structure preference and plain-language warnings; memory dividend | Opt-in auto-guardrails ("block bets where I'm historically 40 points overconfident") |
| **Compete** | The Council: rule-based agents with their own memory, weighted by calibration | Open the Council to third-party agents; rank them publicly |
| **Prove** | Forecaster Passport: signed attestation, per-commit verify, "hidden 0" | On-chain attestation objects any Sui app can read; Nautilus TEE-signed scoring |
| **Monetize** | Credibility API: free summary, paid detail at 0.01 testnet USDC per call via MPP/x402 on Sui *(if shipped)* | Production pricing; subscriptions for calibrated ensemble signals |

---

## 3. Who pays

| Customer | Job to be done | What they buy |
|---|---|---|
| **Prediction-market venues and frontends** | Retain users, surface good forecasters, show skill leaderboards | Passport embeds, calibration leaderboards (white-label) |
| **Copy-trading and social trading apps** | Rank leaders by skill, not luck; stop cherry-picked track records | Credibility API per lookup, plus a monthly plan |
| **Agent builders and agent marketplaces** | Decide which signal sources to trust before acting | Pay-per-call via x402/MPP: agents pay agents |
| **Funds, DAOs and research teams** | Hire or weight forecasters; run forecasting tournaments with provable results | Tournament hosting + verified result exports |
| **Individual traders** | Become better calibrated; prove skill publicly | Free app (acquisition); premium coaching insights later |

Illustrative pricing, not yet validated with customers:
- Consumer app: free.
- Passport and summary API: free up to a monthly limit.
- Detailed credibility calls: pay-per-call (cents) via x402/MPP, so agents need no account.
- B2B dashboards and white-label leaderboards: monthly plans.

---

## 4. Why HELIX can win this market

1. **Tamper-evidence by construction.** Commit-before-settle on Sui plus counting from events means losers can't be hidden. Track records elsewhere can't offer that.
2. **Portability.** The record lives in Walrus Memory, not in one venue's database. HELIX is the scorer and the standard, not the jail.
3. **A data network effect.** Every settled call improves calibration estimates and Council weights. Scores get more trustworthy the longer HELIX runs; a new entrant starts from zero history.
4. **An agent-native business model.** HTTP 402 payments let agents buy reputation per call with no accounts or contracts. That fits how agent commerce is forming right now.
5. **It already works end to end**, on live infrastructure, with every number traceable to a transaction.

---

## 5. Roadmap (plan, not shipped)

| Horizon | Milestones |
|---|---|
| **30 days** | Redeploy on DeepBook Predict mainnet launch day (Predict's stated plan); user-owned Walrus Memory spaces; production Tatum plan; public Passport directory |
| **60 days** | Polymarket and Predict history import; ETH and SUI markets; third-party agents can join the Council; on-chain attestation object |
| **90 days** | Partner pilots with 2–3 copy-trading or prediction frontends; tournament product; TEE-signed scoring; paid API GA |

## 6. Metrics that will matter

- Settled commits per week, and the share with zero hidden.
- Forecasters with n ≥ 20 (the point where calibration is meaningful).
- Calibration improvement after users see memory: does the gap shrink over time?
- Paid API calls, and the share paid by agents.
- Embeds live on third-party sites.

## 7. Risks, stated plainly

- **Regulation.** Commit mode moves no money; real positions use DeepBook Predict. Scoring is information, not advice. Keep it that way, and add jurisdiction review before mainnet positions.
- **Small samples.** Scores are noisy early. Beta priors, n displayed everywhere and minimum-n gates are already in place.
- **Privacy.** The hosted Walrus Memory relayer sees plaintext. Move to user-owned spaces or the manual client for sensitive data; reasoning memory stays opt-in.
- **Dependency risk.** DeepBook Predict testnet funding is manual today. Commit mode keeps HELIX useful regardless.
- **No users or revenue yet.** This is a working product with a clear wedge, not a business yet.

---

## 8. One line

**HELIX is Proof-of-Forecast: a track record of judgment you can't fake, that learns, and that people and agents can pay to trust.**
