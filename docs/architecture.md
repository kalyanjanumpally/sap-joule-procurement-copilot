# Solution architecture

The customer-facing one-pager: what runs where, what data flows, what stays in their landscape.

## Component view

```
┌──────────────────────────────────────────────────────────────────────┐
│                          User (SAP Fiori / Joule Chat)                │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │ natural language
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Joule Runtime (SAP-managed)                        │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────────┐  │
│  │ Intent       │──▶│ Skill selection  │──▶│ procurement-copilot  │  │
│  │ recognition  │   │ (multi-turn)     │   │ Agent (this project) │  │
│  └──────────────┘   └──────────────────┘   └──────────┬───────────┘  │
└─────────────────────────────────────────────────────────┼────────────┘
                                                         │
      ┌──────────────────────────────────────────────────┼──────────┐
      │                    SAP BTP (customer subaccount) │          │
      │                                                  ▼          │
      │  ┌───────────────────────────────────────────────────────┐  │
      │  │  Skills (5):                                          │  │
      │  │   • check-overdue-invoices                            │  │
      │  │   • create-purchase-order                             │  │
      │  │   • check-material-stock                              │  │
      │  │   • vendor-payment-status                             │  │
      │  │   • approve-purchase-order                            │  │
      │  └────────────────────────┬──────────────────────────────┘  │
      │                           │ calls Actions                    │
      │                           ▼                                  │
      │  ┌───────────────────────────────────────────────────────┐  │
      │  │  Actions (OpenAPI descriptions of OData APIs):        │  │
      │  │   • SupplierInvoice · PurchaseOrder                   │  │
      │  │   • MaterialStock · BusinessPartner                   │  │
      │  └────────────────────────┬──────────────────────────────┘  │
      │                           │ via                              │
      │                           ▼                                  │
      │  ┌───────────────────────────────────────────────────────┐  │
      │  │  BTP Destination Service                              │  │
      │  │   destination name: s4hana-sandbox (or production)    │  │
      │  │   • x.509 client cert (prod) OR APIKey (sandbox)      │  │
      │  └────────────────────────┬──────────────────────────────┘  │
      └──────────────────────────┼──────────────────────────────────┘
                                 │ mTLS / OAuth
                                 ▼
      ┌───────────────────────────────────────────────────────────┐
      │              S/4HANA Cloud (customer tenant)              │
      │   • API_SUPPLIERINVOICE_PROCESS_SRV                       │
      │   • API_PURCHASEORDER_PROCESS_SRV                         │
      │   • API_MATERIAL_STOCK_SRV                                │
      │   • API_BUSINESS_PARTNER                                  │
      └───────────────────────────────────────────────────────────┘
```

## What lives where

| Layer | Owner | Notes |
|-------|-------|-------|
| Joule Runtime (LLM, orchestration) | SAP-managed | Runs on SAP's tenant, honors data residency of the customer region |
| Skills, Actions, Agent | **Customer BTP subaccount** | This project — deployed via Joule Studio |
| Destination Service | **Customer BTP subaccount** | Holds S/4 credentials; never surfaced to LLM |
| S/4HANA Cloud APIs | **Customer S/4 tenant** | No mirror/replica — Joule reads/writes live |

## Data flow (write path: "Approve PO 4500000123")

1. User types the utterance in Joule.
2. Joule's runtime classifies intent → routes to `approve-purchase-order` skill.
3. Skill's **prompt** asks the LLM to extract `PurchaseOrder=4500000123`.
4. Skill invokes `PurchaseOrder.setApprovalStatus` action.
5. Action resolves the `s4hana` destination from BTP Destination Service (creds stay server-side).
6. Action fires `POST /API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder('4500000123')/SetReleaseStatus` against the customer's S/4.
7. Response passes through the skill's **response template** — user sees a confirmation card.
8. **Nothing about the credentials, endpoints, or full response body is ever visible to the LLM.**

## Security & governance talking points

- **Credentials never touch the LLM.** Destination Service resolves them per-request; the LLM only sees the shaped result.
- **Every action reuses S/4 authorization.** Joule inherits the calling user's business roles — a user who can't approve POs in Fiori can't approve them via Joule.
- **All writes emit S/4 change documents.** Same audit trail as any other channel.
- **Prompt and response templates are versioned in git.** Full change control on how the assistant behaves — no runtime prompt drift.
- **Data residency preserved.** Customer chooses BTP region; skill artifacts and destinations stay in that region.

## Extension roadmap (post-pilot)

- Add HR skills (`SuccessFactors` employee lookup, leave balance) for cross-function agents.
- Add finance skills (cash flow, journal entry lookup) sharing the same destination pattern.
- Ground on customer PDFs (SOPs, contracts) via Joule Grounding — same project.
- Publish agent to Microsoft Teams / SAP Mobile Start via Joule's channel integrations.
