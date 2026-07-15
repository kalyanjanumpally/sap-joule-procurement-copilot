# Destinations

- **`s4hana-cloud.json`** — sandbox destination pointing at `sandbox.api.sap.com/s4hanacloud`. Paste your API key from https://api.sap.com into the `APIKey` field, then import via **BTP cockpit → Connectivity → Destinations → Import**.

## Moving from sandbox to a customer tenant

For the customer pilot, replace with:

| Field | Sandbox | Customer S/4HANA Cloud |
|-------|---------|------------------------|
| `URL` | `https://sandbox.api.sap.com/s4hanacloud` | `https://<tenant>-api.s4hana.ondemand.com` |
| `Authentication` | `NoAuthentication` (APIKey header) | `ClientCertificateAuthentication` |
| Auxiliary | `APIKey` property | Upload client cert PFX + set `KeyStoreLocation`/`KeyStorePassword` |

The skill JSONs and action YAMLs do not change — only the destination.
