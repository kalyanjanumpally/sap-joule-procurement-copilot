"use client";

export type Slide = "landing" | "architecture" | "skills" | "roi" | "demo";

const items: { key: Slide; label: string }[] = [
  { key: "landing", label: "Overview" },
  { key: "architecture", label: "Architecture" },
  { key: "skills", label: "Skills" },
  { key: "roi", label: "ROI" },
  { key: "demo", label: "Live demo" },
];

export function Nav({ slide, onChange }: { slide: Slide; onChange: (s: Slide) => void }) {
  return (
    <nav className="bg-sap-navy text-white px-8 py-4 flex items-center gap-8 shadow">
      <div className="font-bold text-lg tracking-tight">
        Joule × S/4HANA <span className="text-sap-accent">Procurement Copilot</span>
      </div>
      <div className="flex gap-2 ml-auto">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={`px-3 py-1.5 rounded text-sm transition ${
              slide === it.key
                ? "bg-sap-blue text-white"
                : "text-slate-200 hover:bg-slate-700"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
