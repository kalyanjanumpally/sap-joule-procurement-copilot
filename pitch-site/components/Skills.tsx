"use client";

const skills = [
  {
    name: "check-overdue-invoices",
    category: "Finance",
    utterance: "Show me overdue supplier invoices",
    api: "API_SUPPLIERINVOICE_PROCESS_SRV",
    write: false,
  },
  {
    name: "create-purchase-order",
    category: "Procurement",
    utterance: "Create a PO for 100 units of MAT-1001 from vendor V-500",
    api: "API_PURCHASEORDER_PROCESS_SRV",
    write: true,
  },
  {
    name: "check-material-stock",
    category: "Supply Chain",
    utterance: "How much MAT-1001 do we have in plant 1710?",
    api: "API_MATERIAL_STOCK_SRV",
    write: false,
  },
  {
    name: "vendor-payment-status",
    category: "Finance",
    utterance: "What's the payment status of Acme Corp?",
    api: "API_BUSINESS_PARTNER + INVOICE",
    write: false,
  },
  {
    name: "approve-purchase-order",
    category: "Procurement",
    utterance: "Approve PO 4500000123",
    api: "API_PURCHASEORDER_PROCESS_SRV",
    write: true,
  },
];

export function Skills() {
  return (
    <section>
      <h2 className="text-3xl font-bold text-sap-navy">The five skills</h2>
      <p className="mt-2 text-sap-slate">
        Each is a real Joule Skill manifest in this repo. Read-only skills ship day one; write
        skills require the confirmation gate.
      </p>
      <div className="mt-8 grid gap-4">
        {skills.map((s) => (
          <div
            key={s.name}
            className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center gap-4"
          >
            <div className="md:w-64">
              <div className="text-xs uppercase tracking-widest text-sap-slate">
                {s.category}
              </div>
              <div className="font-mono text-sm font-semibold text-sap-navy">{s.name}</div>
            </div>
            <div className="flex-1 bg-slate-50 rounded px-4 py-2 text-sm italic">
              "{s.utterance}"
            </div>
            <div className="flex items-center gap-2 md:w-72 justify-end">
              <code className="text-xs bg-slate-100 px-2 py-1 rounded">{s.api}</code>
              {s.write && (
                <span className="text-xs bg-sap-accent text-white px-2 py-1 rounded">
                  write
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 text-sm text-sap-slate">
        Composed under <code className="bg-slate-100 px-1">procurement-copilot</code>, an SAP Joule
        Agent that chains the skills for multi-step conversations.
      </div>
    </section>
  );
}
