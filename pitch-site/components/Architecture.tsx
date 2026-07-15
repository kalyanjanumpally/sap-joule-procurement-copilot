"use client";

const layers = [
  {
    title: "User channel",
    color: "bg-sap-navy",
    items: ["SAP Fiori launchpad", "Joule chat pane", "SAP Mobile Start", "Microsoft Teams (post-pilot)"],
  },
  {
    title: "Joule runtime (SAP-managed)",
    color: "bg-sap-blue",
    items: ["Intent recognition", "Skill routing", "procurement-copilot Agent"],
  },
  {
    title: "Your BTP subaccount",
    color: "bg-slate-600",
    items: [
      "5 Skills (JSON) — this project",
      "4 Actions (OpenAPI) — this project",
      "Destination Service (holds S/4 creds)",
    ],
  },
  {
    title: "S/4HANA Cloud (your tenant)",
    color: "bg-emerald-700",
    items: [
      "API_SUPPLIERINVOICE_PROCESS_SRV",
      "API_PURCHASEORDER_PROCESS_SRV",
      "API_MATERIAL_STOCK_SRV",
      "API_BUSINESS_PARTNER",
    ],
  },
];

export function Architecture() {
  return (
    <section>
      <h2 className="text-3xl font-bold text-sap-navy">Architecture</h2>
      <p className="mt-2 text-sap-slate">
        Nothing leaves your landscape. Credentials never touch the LLM.
      </p>
      <div className="mt-8 space-y-4">
        {layers.map((l) => (
          <div key={l.title} className="flex items-stretch shadow rounded overflow-hidden">
            <div className={`${l.color} text-white p-4 w-56 font-semibold flex items-center`}>
              {l.title}
            </div>
            <div className="bg-white flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-2 border border-slate-200">
              {l.items.map((it) => (
                <div key={it} className="bg-slate-50 rounded px-3 py-2 text-sm font-mono">
                  {it}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid md:grid-cols-3 gap-4">
        <Callout title="Data residency" body="Skills, Actions, and Destinations live in your chosen BTP region — US10, EU10, or JP10." />
        <Callout title="Authorization inheritance" body="Every S/4 write call reuses the calling user's business roles. Joule cannot exceed S/4 authorization." />
        <Callout title="Full audit trail" body="Writes emit S/4 change documents. Prompt versions live in git for change control." />
      </div>
    </section>
  );
}

function Callout({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
      <div className="text-sm font-semibold text-sap-blue">{title}</div>
      <div className="text-sm text-sap-slate mt-1">{body}</div>
    </div>
  );
}
