"use client";

import { useState } from "react";

const utterances = [
  "Show me overdue supplier invoices",
  "How much MAT-1001 do we have in plant 1710?",
  "Create a PO for 1000 units of MAT-1001 from vendor V-500",
  "What's the payment status of vendor V-500?",
  "Approve PO 4500000123",
  "Check MAT-1001 stock in plant 1710. If under 500, create a PO for 1000 units from our top-rated vendor and route it for approval.",
];

export function DemoLauncher() {
  const [jouleUrl, setJouleUrl] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  return (
    <section>
      <h2 className="text-3xl font-bold text-sap-navy">Live demo control panel</h2>
      <p className="mt-2 text-sap-slate">
        Paste your deployed Joule chat URL, then click any utterance to copy it — keeps you off
        keyboard hunt-and-peck in front of the customer.
      </p>
      <div className="mt-6 bg-white p-5 rounded-lg border border-slate-200">
        <label className="block text-sm font-semibold text-sap-navy">Joule chat URL</label>
        <input
          type="url"
          value={jouleUrl}
          onChange={(e) => setJouleUrl(e.target.value)}
          placeholder="https://<subaccount>.build.cloud.sap/joule/..."
          className="mt-2 w-full border border-slate-300 rounded px-3 py-2 text-sm"
        />
        {jouleUrl && (
          <a
            href={jouleUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-3 bg-sap-blue text-white px-4 py-2 rounded font-medium hover:bg-blue-700"
          >
            Open Joule chat
          </a>
        )}
      </div>

      <div className="mt-8 grid gap-3">
        {utterances.map((u, i) => (
          <button
            key={u}
            onClick={() => {
              navigator.clipboard.writeText(u);
              setCopied(i);
              setTimeout(() => setCopied(null), 1500);
            }}
            className="text-left bg-white p-4 rounded-lg border border-slate-200 hover:border-sap-blue transition flex justify-between items-center"
          >
            <span className="italic">"{u}"</span>
            <span
              className={`text-xs font-semibold ${
                copied === i ? "text-emerald-600" : "text-sap-blue"
              }`}
            >
              {copied === i ? "Copied ✓" : "Copy"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
