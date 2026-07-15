# Screen recording script — cds-plugin-llm demo

Target: a **60-90 second** clip to embed in the community.sap.com blog post and reuse on LinkedIn. Optimized for muted playback with captions (most technical viewers scroll past sound-required video).

The single visual message: **one CAP handler, three swappable LLM backends, config-file change only.**

---

## Pre-recording setup (10 minutes)

### Environment

- [ ] Mac Studio Ollama running (`launchctl print gui/$(id -u)/com.ollama.serve` shows `state = running`). If not, `launchctl kickstart -k gui/$(id -u)/com.ollama.serve` via SSH.
- [ ] Reach test from laptop: `curl -s http://192.168.5.13:11434/api/tags | head -c 60` returns JSON quickly.
- [ ] **Pre-warm the Ollama model** — send one dummy chat request so the model is loaded in memory. First inference is 5-15s slower otherwise, and that dead air kills the video pace.
   ```sh
   curl -sS http://192.168.5.13:11434/api/chat -d '{"model":"qwen2.5:14b","messages":[{"role":"user","content":"hi"}],"stream":false}' > /dev/null
   ```
- [ ] `cds watch` running (`cd joule-project-api && NODE_PRESERVE_SYMLINKS=1 npm run watch`); `http://localhost:4004/ai/summarizePurchaseOrder` responds.
- [ ] If planning to show the Anthropic path too: verify credits are available (`curl` a tiny request first).

### Screen / OS

- [ ] macOS System Settings → **Focus** → Do Not Disturb ON.
- [ ] Slack, Mail, Messages, Discord — quit (not just close windows). Notifications during recording are unusable.
- [ ] Hide the desktop icons: `defaults write com.apple.finder CreateDesktop false; killall Finder`. Restore after: `defaults write com.apple.finder CreateDesktop true; killall Finder`.
- [ ] Menu bar: clean it up. Tools like [Bartender](https://www.macbartender.com/) or the built-in `Sonoma+` menu bar customization to hide non-essential icons.
- [ ] Wallpaper: solid dark or brand-neutral. No family photos or busy patterns.

### Terminal

- [ ] Font: **JetBrains Mono** or **Menlo**, **18pt minimum** (24pt is better for mobile viewers).
- [ ] Theme: high-contrast dark (`Solarized Light` reads great, avoid `Solarized Dark` — muddy in compressed video).
- [ ] Window: fixed size, roughly **1400×800** — big enough to read at 1080p export, small enough that JSON output doesn't wrap ugly.
- [ ] Clear the shell (`clear`) between takes. Prompt should be short — no fancy multiline git-branch prompt.
- [ ] Alias any long commands so what you type on-screen is short and readable. Example:
   ```sh
   alias po='curl -sS -X POST http://localhost:4004/ai/summarizePurchaseOrder -H "content-type: application/json" -d @/tmp/po.json | jq'
   ```

### Editor

- [ ] VS Code (or your editor) — **font 18pt+**, minimap OFF, sidebar collapsed, status bar hidden (`View → Appearance → Status Bar`).
- [ ] Zen Mode (`Cmd+K Z`) if showing a single file — removes all chrome.
- [ ] Have both config snippets ready as separate files or git stash entries so the swap is a one-keystroke edit, not typing.

### Recording tool (pick one)

| Tool | Cost | Good for |
| --- | --- | --- |
| **QuickTime** (built-in) | Free | Draft takes; no cursor polish |
| **CleanShot X** | ~$29 | Best middle ground; auto cursor highlight, easy trim |
| **Screen Studio** | ~$229 | Blog-embed polish: auto-zoom on clicks, smooth cursor, background gradient — the "SaaS demo" look |
| **OBS** | Free | Total control if you already know it; overkill otherwise |

For a first attempt: **CleanShot X**. Auto-generated smooth cursor + easy inline trim is where 80% of the "amateur → professional" gap closes.

---

## The script — 60-second version (LinkedIn-optimized)

Total: ~60s. Each beat is a **single continuous recording**; do NOT try to record it in one take. Record 4 clips, edit together.

### Clip 1 (0:00–0:08) — the pitch code

**Screen:** VS Code showing `joule-project-api/srv/ai-service.js`, focused on the handler.

**Highlight:** the `await llm.chat({ ... })` line. Cursor or CleanShot highlight-box.

**Caption:** `One CAP handler.`

**No typing.** Just show, hold 3s.

### Clip 2 (0:08–0:28) — running against local Ollama

**Screen:** terminal, split-view or full.

**Type (visible):**
```sh
po
```

**Response streams in** (~2-4s on qwen2.5:14b, pre-warmed):
```json
{
  "purchaseOrderId": "4500000123",
  "summary": "Acme Steel GmbH supplies 24000 kg of cold-rolled steel...",
  "model": "qwen2.5:14b"
}
```

**Caption on screen:** `Local Ollama on Mac Studio · qwen2.5:14b · free`

Hold for 3s after response completes.

### Clip 3 (0:28–0:48) — the config swap

**Screen:** VS Code, `joule-project-api/package.json`, focused on `cds.requires.llm.[development]`.

**Show the edit** (either type it live or use a keyboard shortcut to swap files):
```diff
- "kind": "llm-ollama",
- "modelId": "qwen2.5:14b"
+ "kind": "llm-anthropic",
+ "modelId": "claude-opus-4-7"
```

**Caption:** `Config change. Handler untouched.`

Hold 2s.

### Clip 4 (0:48–1:00) — same call, Claude backend

**Screen:** back to terminal. Same `po` command.

**Type:**
```sh
po
```

**Response** (2-5s):
```json
{
  "purchaseOrderId": "4500000123",
  "summary": "Acme Steel GmbH is supplying...",
  "model": "claude-opus-4-7"
}
```

**Caption on screen:** `Claude Opus 4.7 · via Anthropic API`

**Final overlay (last 3s):**
```
npm install @saptarishi/cds-plugin-llm
github.com/kalyanjanumpally/sap-joule-procurement-copilot
```

Fade to end card.

---

## The script — 90-second version (blog embed)

Add these two clips to the 60s version:

### Extra Clip A (before Clip 1) — the install proof (0:00–0:10)

**Screen:** empty terminal, big font.

**Type:**
```sh
npm install @saptarishi/cds-plugin-llm
```

Let npm show its output (added 1 package, 4.6 kB). ~5s.

**Caption:** `New today: an LLM-agnostic CAP plugin`

Then transition into Clip 1.

### Extra Clip B (between Clip 3 and Clip 4) — GenAI Hub future path

**Screen:** VS Code, `package.json`, `[production]` profile.

**Highlight:**
```json
"[production]": {
  "kind": "llm-genai-hub",
  "credentials": { "deploymentId": "..." }
}
```

**Caption:** `Ship to BTP → same handler runs on SAP Generative AI Hub`

Hold 4s. Then Clip 4 as before.

Total: ~90s.

---

## Post-production checklist

- [ ] **Trim aggressively.** Any pause > 500ms between visual events should be cut. Especially the "waiting for the API" pauses — either cut, or overlay a subtle "thinking..." animation.
- [ ] **Add captions.** ~70% of LinkedIn video plays muted. CapCut, Descript, or your recording tool likely has auto-caption. Review for technical terms (`Ollama`, `CAP`, `Joule` — auto-caption gets these wrong).
- [ ] **Zoom in on the click points** — the config-diff line, the highlighted `llm.chat` call. Screen Studio does this automatically; CleanShot / QuickTime require manual zoom via post-production tools.
- [ ] **End card** must include the npm package + repo URL. Screen reader visible, ~4s hold.
- [ ] **Export settings:** 1080p MP4, H.264, 30fps, target <25MB. Anything larger loses viewers to slow load.
- [ ] **Length hard cap:**
  - LinkedIn: 90s max, ideal 60s
  - Blog embed: 2min max
  - Twitter/X: 140s free tier

## Distribution

| Channel | Format | Notes |
| --- | --- | --- |
| **community.sap.com blog** | Embed via `[video]` markdown macro, or upload as attachment | Native SAP video hosting is auto-approved; external YouTube embed sometimes gets held for moderation |
| **LinkedIn** | Native video upload (NOT a YouTube link) | Algorithm boosts native uploads ~5x. Post with "Just published on community.sap.com — [link]" |
| **Twitter/X** | Native video, 60s cut | Add first-tweet hook: "Prototyping a Joule skill against paid GenAI Hub gets expensive. Here's a CAP plugin that lets you develop locally against Ollama or Claude, then flip a config to ship on GenAI Hub." |
| **SAP Community Slack / relevant Discord** | Direct link to the community.sap.com post | Don't share the video directly — drive traffic to the blog post so the discussion happens there |

## Optional: two-take alternative

If cutting together 4-6 clips feels heavy, do a **single continuous 90s take** — one clean take with no edits. Trade-offs: harder to nail (any fumble = restart), but faster to produce and feels more "authentic developer sharing" than a polished marketing cut. Both work. The 4-clip cut lands better on LinkedIn; the single take lands better inside developer communities (community.sap.com, r/SAP).

## When to record

- **Not late at night after an emotional debug session.** Cursor jitter, typos, and general low-energy vibes all show up on camera.
- **After coffee, before lunch** is a genuine best-time-of-day for screen recordings — energy, focus, no post-lunch slump.
- Budget **60-90 minutes of calendar time** for a "single 90s clip." That's setup + 4-6 takes + editing + captions + export. Anyone who says a polished demo takes 15 minutes has never made one.
