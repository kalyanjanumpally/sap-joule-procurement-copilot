# 1. Sign up for a free SAP BTP trial

SAP BTP (Business Technology Platform) is the umbrella for SAP Build, Joule Studio, and BTP Destinations. The trial account gives you enough entitlements to deploy this project without a paid tenant.

## Step 1 — Create the trial account

1. Go to **https://www.sap.com/products/technology-platform/trial.html**
2. Click **Start your free trial**.
3. Register with a business email (personal Gmail addresses are sometimes rejected — use a work / student / alumni address).
4. Choose region: **US East (Virginia)** or **Europe (Frankfurt)** — Joule Studio is available in both. Pick whichever is closer.
5. Verify email, set password, log in.

## Step 2 — Set up the subaccount

The trial provisions a subaccount automatically at `<yourname>trial`. If it does not, click **Create Subaccount** with these settings:

| Field | Value |
|-------|-------|
| Display Name | `joule-demo` |
| Provider | AWS or Azure (either works) |
| Region | Same region you chose above |

## Step 3 — Confirm you have the right entitlements

In your subaccount, go to **Entitlements → Configure Entitlements** and confirm the trial has these services enabled (they usually are by default):

- **SAP Build** — includes Joule Studio
- **Destination Service**
- **Connectivity Service**
- **Cloud Foundry Runtime** (optional, only if you extend with custom actions)
- **AI Core** (default `standard` service plan — available on trial)

If any are missing, click **Add Service Plans**, search, and add the default plan.

## Step 4 — Note your account details

You'll need these later:

- **Subaccount ID** (found in subaccount overview)
- **Region host** (e.g. `cf.us10.hana.ondemand.com`)
- **Trial expiry date** — trials run 90 days; extend once with a single click from the cockpit.

## Common issues

- **"Personal email not allowed"** — use a work email or your university alumni email (like `@alumni.iitm.ac.in`).
- **"Joule Studio not visible in SAP Build"** — see `02-enable-joule-studio.md`; it needs to be explicitly opened via Build's Business Content.
- **"Region does not support Joule"** — as of 2026-Q2, Joule Studio is available in US10, EU10, and JP10. Recreate the subaccount in a supported region.

Once the subaccount is up, continue to `02-enable-joule-studio.md`.
