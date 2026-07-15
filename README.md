# SAP Joule — S/4HANA Cloud Procurement & Finance Copilot

A real SAP Joule project targeting **S/4HANA Cloud** for Finance, Procurement, and Supply Chain. Includes deployable Joule Studio artifacts (skills, agent, actions, destinations) and a customer-facing pitch site.

Use this repo to:

1. Spin up a **free SAP BTP trial** with Joule Studio enabled (see `docs/01-setup-btp-trial.md`).
2. Import the skills and agent from `joule-project/` into Joule Studio.
3. Run the live demo using `docs/04-demo-script.md`.
4. Show the pitch site (`pitch-site/`) as the visual companion during the customer meeting.

## What's inside

| Path | Purpose |
|------|---------|
| `joule-project/skills/` | Five real Joule Skills (JSON manifests + prompt/response templates) |
| `joule-project/agents/procurement-copilot/` | Joule Agent that orchestrates the skills |
| `joule-project/actions/` | OpenAPI specs for the real S/4HANA Cloud OData APIs each skill calls |
| `joule-project/destinations/` | SAP BTP Destination configuration for the S/4HANA Cloud system |
| `docs/` | BTP trial setup, Joule Studio enablement, import guide, demo script, architecture |
| `pitch-site/` | Next.js customer-facing companion (value prop, architecture visuals, ROI calc) |

## The five skills

| Skill | Utterance | S/4HANA API |
|-------|-----------|-------------|
| `check-overdue-invoices` | "Show overdue supplier invoices" | `API_SUPPLIERINVOICE_PROCESS_SRV` |
| `create-purchase-order` | "Create a PO for 100 units of MAT-1001 from vendor V-500" | `API_PURCHASEORDER_PROCESS_SRV` |
| `check-material-stock` | "How much MAT-1001 do we have in plant 1710?" | `API_MATERIAL_STOCK_SRV` |
| `vendor-payment-status` | "What's the payment status of Acme Corp?" | `API_BUSINESS_PARTNER` |
| `approve-purchase-order` | "Approve PO 4500000123" | `API_PURCHASEORDER_PROCESS_SRV` |

## The agent

`procurement-copilot` is a Joule Agent that composes the skills into multi-step conversations, e.g.:

> "Check MAT-1001 stock in plant 1710. If under 500, create a PO for 1000 units from our top-rated vendor and route it for approval."

## Quick start (60-minute path to a working demo)

1. **Sign up for SAP BTP trial** — `docs/01-setup-btp-trial.md` (10 min).
2. **Enable Joule Studio in SAP Build** — `docs/02-enable-joule-studio.md` (10 min).
3. **Register the S/4HANA Cloud sandbox destination** — `docs/03-import-skills.md` §1 (10 min).
4. **Import skills + agent** — `docs/03-import-skills.md` §2–4 (20 min).
5. **Rehearse with the demo script** — `docs/04-demo-script.md` (10 min).

## Pitch site (customer-facing)

```bash
cd pitch-site
npm install
npm run dev
```

Open http://localhost:3000 during the meeting — it visualizes the architecture, value drivers, and lets you drop into the live Joule demo from a single button.

## What is real vs. what is scaffolded

- **Real:** Skill manifests, agent definition, OpenAPI action specs, destination config, and utterance grounding — these are the actual artifacts Joule Studio consumes.
- **Scaffolded:** Destination credentials (you fill in your BTP trial's S/4HANA sandbox URL + client cert on first import). No secrets are committed.

See `docs/architecture.md` for the full solution diagram.
