"use client";

export function Landing({ onNext }: { onNext: () => void }) {
  return (
    <section className="grid md:grid-cols-2 gap-10 items-center">
      <div>
        <h1 className="text-5xl font-bold tracking-tight text-sap-navy leading-tight">
          One conversation.
          <br />
          Three SAP tabs closed.
        </h1>
        <p className="mt-6 text-lg text-sap-slate">
          A production-ready SAP Joule copilot for Finance, Procurement, and Supply Chain — built on
          your S/4HANA Cloud tenant, deployed via SAP BTP, governed by your existing roles.
        </p>
        <div className="mt-8 flex gap-3">
          <button
            onClick={onNext}
            className="bg-sap-blue text-white px-5 py-2.5 rounded font-medium hover:bg-blue-700"
          >
            See how it works
          </button>
          <a
            href="https://www.sap.com/products/artificial-intelligence/ai-assistant.html"
            target="_blank"
            rel="noreferrer"
            className="border border-sap-navy text-sap-navy px-5 py-2.5 rounded font-medium hover:bg-sap-navy hover:text-white"
          >
            About Joule
          </a>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200">
        <div className="text-xs uppercase tracking-widest text-sap-slate mb-3">
          Live example — sent to Joule
        </div>
        <div className="bg-slate-100 rounded px-4 py-3 mb-3 font-mono text-sm">
          Check MAT-1001 stock in plant 1710. If under 500, create a PO for 1000 units from our
          top-rated vendor and route it for approval.
        </div>
        <div className="text-xs uppercase tracking-widest text-sap-slate mb-3">
          What Joule does (one turn)
        </div>
        <ol className="space-y-2 text-sm">
          <li>
            <span className="font-semibold text-sap-blue">1.</span> Calls{" "}
            <code className="bg-slate-100 px-1 rounded">MaterialStock.list</code> → 320 EA on hand.
          </li>
          <li>
            <span className="font-semibold text-sap-blue">2.</span> Calls{" "}
            <code className="bg-slate-100 px-1 rounded">BusinessPartner.search</code> → picks top
            supplier for MAT-1001.
          </li>
          <li>
            <span className="font-semibold text-sap-blue">3.</span> Confirms with user, then calls{" "}
            <code className="bg-slate-100 px-1 rounded">PurchaseOrder.create</code> → PO 4500000123.
          </li>
          <li>
            <span className="font-semibold text-sap-blue">4.</span> Surfaces the PO for release via
            existing S/4 release strategy.
          </li>
        </ol>
      </div>
    </section>
  );
}
