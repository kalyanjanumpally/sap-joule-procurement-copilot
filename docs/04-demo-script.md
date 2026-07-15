# 4. Customer demo script

A 12-minute live demo built around a **procurement operations day** narrative. Optimized to earn the second meeting — not to teach Joule.

## Setup checklist (10 min before customer joins)

- [ ] BTP subaccount logged in, Joule Studio project `s4-procurement-copilot` **Deployed** and **Ready**.
- [ ] Joule chat pane open in one browser tab, `pitch-site` open at `http://localhost:3000` in another. **`Cmd+Tab` between them, not window rearrange.**
- [ ] Do-not-disturb on. Slack/Teams closed. Notifications silenced.
- [ ] `pitch-site` on the **Architecture** slide so you can open with it.

## Act 1 — Frame the problem (2 min)

Show the pitch site's **Landing** view. Say (paraphrased):

> "Procurement teams spend 30–40% of their time in three system tabs — S/4, an invoice inbox, and a supplier portal. Joule collapses that into one conversation. What you're about to see runs on your S/4HANA Cloud data, in your BTP tenant, with your approval controls. Nothing leaves your landscape."

Click through to the **Architecture** slide. 30 seconds max — don't teach it.

## Act 2 — The five live utterances (7 min)

Switch to the Joule chat pane. Run these in order — each maps to one skill in this repo.

### Utterance 1 — "Show me overdue supplier invoices."

**Expected outcome:** A ranked list of invoices with vendor, amount, days overdue.

**Say:** *"This is real data from your finance backend. No new report, no BI request queue."*

### Utterance 2 — "How much MAT-1001 do we have in plant 1710?"

**Expected outcome:** Current stock quantity + reorder point warning.

**Say:** *"Notice the reorder threshold call-out — that's the skill's response template highlighting an actionable signal, not just a number."*

### Utterance 3 — "Create a PO for 1,000 units of MAT-1001 from vendor V-500."

**Expected outcome:** Joule confirms the details, asks for approval, then returns a PO number.

**Say:** *"Every write action goes through a confirmation step. Governance and audit are preserved."*

### Utterance 4 — "What's the payment status of vendor V-500?"

**Expected outcome:** Vendor 360 summary — outstanding invoices, average days-to-pay, blocked status.

**Say:** *"The same conversation just pivoted from procurement to finance. That's Joule composing skills — it's not five separate chatbots."*

### Utterance 5 — "Approve PO 4500000123."

**Expected outcome:** Joule shows PO details, awaits explicit "yes," then confirms approval.

**Say:** *"This is the moment leadership asks about: approvals through natural language, with the same authorization controls S/4 already enforces."*

## Act 3 — The agent moment (2 min)

Now the payoff — the multi-step orchestration.

Type:

> "Check MAT-1001 stock in plant 1710. If it's under 500, create a PO for 1,000 units from our top-rated vendor and route it for approval."

The `procurement-copilot` agent chains three skills: `check-material-stock` → `create-purchase-order` → surfaces for approval.

**Say:** *"One sentence. Three system calls. Zero swivel-chair. This is what your team's day looks like six months after go-live."*

## Act 4 — Close (1 min)

Switch back to the pitch site's **ROI Calculator** slide. Plug in the customer's headcount for procurement ops.

Ask, deliberately:

> "For a 90-day pilot on two skills of your choice — probably invoice and PO — what would be the two hardest constraints from your side?"

You are not asking for the deal. You are surfacing the objections while the demo memory is fresh.

## If Joule times out or errors

- **Sandbox slow:** the SAP Business Accelerator Hub sandbox occasionally throttles. Wait 10 seconds, retry. Do not panic-narrate.
- **Utterance not matched:** rephrase using the exact wording from this script — the utterances in each `skill.json` are trained on these phrasings.
- **Complete outage:** switch to the pitch site's **Recorded demo** tab (record the flow the day before as backup).

## Post-demo (send within 4 hours)

- Architecture diagram (`docs/architecture.md` exported to PDF).
- Rehearse-recorded demo video link.
- One-page pilot proposal (skills, timeline, success metrics).
