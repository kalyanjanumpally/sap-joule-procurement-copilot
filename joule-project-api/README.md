# joule-project-api

CAP backend for the **Procurement Copilot** Joule agent. Hosts LLM-backed actions the agent calls via a BTP destination.

## Actions exposed

| OData action | Purpose |
|---|---|
| `POST /ai/summarizePurchaseOrder` | 2-sentence approver-ready PO summary |
| `POST /ai/explainInvoiceRisk` | AP triage risk rating (low/medium/high) + rationale |

Both actions delegate to whichever LLM provider is configured under `cds.requires.llm` (see [`../cds-plugin-llm`](../cds-plugin-llm/README.md)).

## Provider by profile

Configured in `package.json`:

| Profile | Provider | Cost |
|---|---|---|
| `development` (default) | `llm-anthropic` (Claude) | Anthropic API pennies per request |
| `hybrid` | `llm-anthropic` | Same |
| `production` | `llm-genai-hub` (SAP AI Core) | BTP paid tier |

Swap provider without touching handler code — `srv/ai-service.js` only talks to `cds.connect.to('llm')`.

## Run locally

```sh
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run watch
```

Then:

```sh
curl -X POST http://localhost:4004/ai/summarizePurchaseOrder \
  -H 'content-type: application/json' \
  -d '{
    "purchaseOrderId": "4500000123",
    "poJson": "{\"supplier\":\"Acme Steel GmbH\",\"material\":\"Cold-rolled steel coil, 1.2mm\",\"quantity\":24000,\"unit\":\"kg\",\"netAmount\":38400,\"currency\":\"EUR\",\"requestedDelivery\":\"2026-08-01\"}"
  }'
```

## Deploy to BTP

Add to your MTA descriptor as a Node.js module bound to:
- `xsuaa` (auth)
- `destination` (for the S/4HANA read the calling skill will do first)
- `aicore` service instance (extended plan) if using the `production` profile

The Joule side wiring lives in [`../joule-project/`](../joule-project/):
- `actions/cap-ai-summarize.openapi.yaml` — action spec Joule consumes
- `destinations/cap-ai-backend.json` — destination pointing at this app
- `skills/summarize-po/` — skill definition + prompt
