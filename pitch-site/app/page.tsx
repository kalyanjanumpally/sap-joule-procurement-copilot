"use client";

import { useState } from "react";
import { Nav, Slide } from "@/components/Nav";
import { Landing } from "@/components/Landing";
import { Architecture } from "@/components/Architecture";
import { Skills } from "@/components/Skills";
import { ROI } from "@/components/ROI";
import { DemoLauncher } from "@/components/DemoLauncher";

export default function Page() {
  const [slide, setSlide] = useState<Slide>("landing");

  return (
    <div className="min-h-screen flex flex-col">
      <Nav slide={slide} onChange={setSlide} />
      <main className="flex-1 px-8 py-10 max-w-6xl w-full mx-auto">
        {slide === "landing" && <Landing onNext={() => setSlide("architecture")} />}
        {slide === "architecture" && <Architecture />}
        {slide === "skills" && <Skills />}
        {slide === "roi" && <ROI />}
        {slide === "demo" && <DemoLauncher />}
      </main>
      <footer className="text-center text-xs text-sap-slate py-4">
        Built on SAP Joule Studio · S/4HANA Cloud · SAP Business Technology Platform
      </footer>
    </div>
  );
}
