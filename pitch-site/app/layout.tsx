import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAP Joule — S/4HANA Procurement Copilot",
  description:
    "A working SAP Joule project for Finance, Procurement, and Supply Chain on S/4HANA Cloud.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
