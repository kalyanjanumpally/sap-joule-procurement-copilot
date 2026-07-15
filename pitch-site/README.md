# pitch-site

Customer-facing companion for the SAP Joule pitch. Run alongside the live Joule chat during the meeting.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Five slides in the top nav:

- **Overview** — headline and a one-turn example
- **Architecture** — layered view of Joule → BTP → S/4HANA
- **Skills** — the five real skills in this repo
- **ROI** — live calculator with sliders (drives the pricing conversation)
- **Live demo** — paste your deployed Joule chat URL + copy-to-clipboard utterance bank

## Stack

Next.js 15 · React 19 · Tailwind CSS · TypeScript.
