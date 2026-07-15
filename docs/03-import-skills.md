# 3. Import destination, actions, skills, and agent

You now have a BTP subaccount and an empty Joule Studio project. This guide connects it to the **S/4HANA Cloud sandbox** on SAP Business Accelerator Hub (free, no customer tenant needed) and imports every artifact from `joule-project/`.

## §1 — Register the S/4HANA Cloud sandbox destination

The sandbox lives at `https://sandbox.api.sap.com/s4hanacloud/`. It exposes the same OData APIs as a customer's S/4HANA Cloud tenant, protected by an **API Key** header — free to obtain.

### 1a. Get your sandbox API key

1. Go to **https://api.sap.com** and sign in with your BTP trial user.
2. Search for **"SAP S/4HANA Cloud"** — pick any API in the family (e.g., *Purchase Order (A2X)*).
3. On the API page, click **Show API Key** (top-right). Copy the value.

### 1b. Create the destination in BTP cockpit

1. In your subaccount, go to **Connectivity → Destinations → New Destination**.
2. Fill in exactly:

   ```
   Name:                s4hana-sandbox
   Type:                HTTP
   URL:                 https://sandbox.api.sap.com/s4hanacloud
   Proxy Type:          Internet
   Authentication:      NoAuthentication
   ```

3. Under **Additional Properties**, click **New Property** and add:

   ```
   Key:   APIKey
   Value: <paste the sandbox API key from step 1a>

   Key:   HTML5.DynamicDestination
   Value: true

   Key:   WebIDEEnabled
   Value: true
   ```

4. Click **Save**. Then click **Check Connection** — you should see `200 OK`.

The pre-authored version of this destination is in `joule-project/destinations/s4hana-cloud.json`; you can also import it via **Destinations → Import** and just replace the `APIKey` value.

## §2 — Import the four actions

Actions are OpenAPI descriptions of the backend calls skills invoke. Joule Studio treats them as callable functions.

1. In SAP Build, open the **`s4-procurement-copilot`** Joule project.
2. Click the **Actions** tab in the left panel.
3. Click **Import Action → From OpenAPI**.
4. For each file in `joule-project/actions/`, upload it and set the destination to `s4hana-sandbox`:

   | File | Action name in Joule Studio |
   |------|-----------------------------|
   | `s4hana-supplier-invoice.openapi.yaml` | `SupplierInvoice` |
   | `s4hana-purchase-order.openapi.yaml` | `PurchaseOrder` |
   | `s4hana-material-stock.openapi.yaml` | `MaterialStock` |
   | `s4hana-business-partner.openapi.yaml` | `BusinessPartner` |

5. After each import, click **Test** on the action's `GET` operation to confirm the destination wiring works. A `200 OK` with sandbox data proves the round-trip.

## §3 — Import the five skills

1. Click the **Skills** tab.
2. Click **Import Skill → From JSON**.
3. Upload each `skill.json` from `joule-project/skills/*/skill.json`:

   - `check-overdue-invoices/skill.json`
   - `create-purchase-order/skill.json`
   - `check-material-stock/skill.json`
   - `vendor-payment-status/skill.json`
   - `approve-purchase-order/skill.json`

4. For each skill, verify the **Prompt** and **Response Template** tabs — they should auto-populate from the sibling `prompt.md` and `response-template.md` files (Joule Studio's import bundles referenced markdown files when they sit next to `skill.json`). If not, paste them in manually.

5. Click **Save** on each skill.

## §4 — Import the procurement-copilot agent

1. Click the **Agents** tab.
2. Click **Import Agent → From JSON** and upload `joule-project/agents/procurement-copilot/agent.json`.
3. Confirm the agent lists all five skills as **member skills**.
4. Click **Save**.

## §5 — Deploy

1. Click **Deploy** (top-right).
2. Wait for the status to become **Ready** (30–60 seconds on trial).
3. Click **Open Joule** — a chat pane appears with your custom skills available.

Test with:

> "Show me overdue supplier invoices"

If you see a formatted list, you're ready for the customer demo. Continue to `04-demo-script.md`.

## Common issues

- **"Destination check fails with 403"** — the API key wasn't attached. Re-open destination properties and confirm the `APIKey` property is spelled exactly.
- **"Skill import says action not found"** — you skipped §2. Actions must exist before skills that reference them.
- **"Deploy button greyed out"** — one or more skills are in draft state. Open each skill and click **Save** explicitly.
