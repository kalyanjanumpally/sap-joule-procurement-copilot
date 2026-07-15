"use client";

import { useState, useMemo } from "react";

export function ROI() {
  const [headcount, setHeadcount] = useState(25);
  const [hourlyCost, setHourlyCost] = useState(45);
  const [hoursPerWeek, setHoursPerWeek] = useState(12);
  const [adoption, setAdoption] = useState(60);

  const annual = useMemo(() => {
    const weeks = 46;
    const hoursSavedPerPerson = hoursPerWeek * (adoption / 100);
    const hoursSaved = headcount * hoursSavedPerPerson * weeks;
    const dollarsSaved = hoursSaved * hourlyCost;
    return { hoursSaved, dollarsSaved };
  }, [headcount, hourlyCost, hoursPerWeek, adoption]);

  return (
    <section>
      <h2 className="text-3xl font-bold text-sap-navy">ROI calculator</h2>
      <p className="mt-2 text-sap-slate">
        Baseline assumptions: procurement ops teams spend 30–40% of their time on retrieval and
        approvals in S/4. Adjust the sliders to your customer's numbers, live.
      </p>
      <div className="mt-8 grid md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-6">
          <Slider label="Procurement ops headcount" value={headcount} min={1} max={500} onChange={setHeadcount} suffix="people" />
          <Slider label="Fully-loaded hourly cost" value={hourlyCost} min={20} max={200} onChange={setHourlyCost} suffix="$/hr" />
          <Slider label="Hours/week per person on swivel-chair work" value={hoursPerWeek} min={1} max={30} onChange={setHoursPerWeek} suffix="hrs" />
          <Slider label="Realistic Joule adoption in year 1" value={adoption} min={10} max={100} onChange={setAdoption} suffix="%" />
        </div>
        <div className="bg-sap-navy text-white p-8 rounded-lg flex flex-col justify-center">
          <div className="text-sm uppercase tracking-widest text-slate-300">Annual impact</div>
          <div className="mt-3 text-5xl font-bold text-sap-accent">
            ${Math.round(annual.dollarsSaved / 1000).toLocaleString()}K
          </div>
          <div className="mt-1 text-slate-300">saved per year</div>
          <div className="mt-6 text-sm text-slate-300">
            = {Math.round(annual.hoursSaved).toLocaleString()} hours of procurement ops labor
            redirected to strategic sourcing and vendor management.
          </div>
        </div>
      </div>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm text-sap-slate">
        <span>{label}</span>
        <span className="font-semibold text-sap-navy">
          {value} {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-2 accent-sap-blue"
      />
    </div>
  );
}
