# 2. Enable Joule Studio inside SAP Build

Joule Studio is the design-time tooling for authoring Joule Skills and Agents. It lives inside **SAP Build** (formerly Business Application Studio / Build Apps unified workspace).

## Step 1 — Open SAP Build from the BTP cockpit

1. In your trial subaccount, go to **Instances and Subscriptions**.
2. Find **SAP Build** in the subscriptions list. If not present, click **Create → Subscription → SAP Build**, choose the **Standard (trial)** plan, and subscribe.
3. When status becomes **Subscribed**, click **Go to Application** — this opens the SAP Build workspace at `https://<subaccount>.build.cloud.sap`.

## Step 2 — Assign yourself the Joule Studio role

Joule Studio access requires two role collections. Trials pre-create them, but you must self-assign.

1. In the BTP cockpit, go to **Security → Users**.
2. Select your user, click **Assign Role Collection**, and add:
   - `Build Developer`
   - `Joule Studio Developer` *(sometimes named `Joule_Studio_Developer` — either matches)*
3. **Log out and log back in** to SAP Build for the roles to take effect.

## Step 3 — Create a Joule Studio project

1. In SAP Build, click **Create → Build a Business Site or Automation → Joule Skill**.
   - If you don't see this tile, use the search box in **Create** and type `Joule`.
2. Name the project **`s4-procurement-copilot`**.
3. Choose the default workspace (`joule-demo`).
4. Click **Create**. You land in the Joule Studio editor with an empty project.

## Step 4 — Familiarize yourself with the Joule Studio layout

The left panel shows four tabs — memorize these; the import guide uses them:

| Tab | What it holds |
|-----|---------------|
| **Skills** | Individual natural-language capabilities (what we import from `joule-project/skills/`) |
| **Agents** | Multi-skill orchestrators (what we import from `joule-project/agents/`) |
| **Actions** | Backend calls (OpenAPI / OData) skills invoke — imported from `joule-project/actions/` |
| **Grounding** | Data sources for retrieval-augmented answers (documents, SAP data) |

## Step 5 — Confirm the runtime target

At the top-right of the editor, the **Deploy Target** dropdown should say **Joule (SAP Build Runtime)**. That is where skills execute once published. Trials use a shared runtime — sufficient for demos.

## Common issues

- **"Joule Skill tile missing under Create"** — the role collection assignment didn't propagate. Log out, wait 60 seconds, log back in.
- **"Trial region shows no Joule Studio subscription"** — Joule Studio trial is available in US10, EU10, JP10 as of 2026-Q2. Recreate the subaccount in a supported region.
- **"Deploy Target dropdown is empty"** — SAP Build entitlement missing runtime. Go to **Entitlements** and add `SAP Build → application-runtime` plan.

Continue to `03-import-skills.md`.
