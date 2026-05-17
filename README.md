# Flattora × ZUKKU — AI Travel Concierge on Kite Chain

> **Kite AI Global Hackathon 2026 — Agentic Commerce Track**

[![Kite Chain](https://img.shields.io/badge/Kite_Chain-Settled-4AFF8C?style=flat-square)](https://gokite.ai)
[![Track](https://img.shields.io/badge/Track-Agentic_Commerce-C9A84C?style=flat-square)](https://www.encodeclub.com/programmes/kites-hackathon-ai-agentic-economy)
[![Stack](https://img.shields.io/badge/Stack-Hono_%2B_Cloudflare_Pages-orange?style=flat-square)](https://hono.dev)

---

## What Is Flattora?

**Flattora** is an autonomous AI travel concierge powered by **ZUKKU** — a small owl-shaped robot agent. Users describe their ideal Japan retreat, and ZUKKU:

1. Asks preference questions to understand travel style
2. Discovers curated hidden ryokan & experiences
3. **Autonomously executes USDC payments via x402 protocol** on Kite chain
4. Manages Agent-to-Agent (A2A) settlements to merchant wallets
5. Auto-purchases travel essentials (trekking socks, eco-bags, etc.) within a user-defined budget cap

No repeated approvals. One session covers the entire trip — bookings, payments, and incidentals.

---

## Live Demo

| Environment | URL |
|-------------|-----|
| **Production (Cloudflare Pages)** | https://flattora.pages.dev *(after deploy)* |
| GitHub Repository | https://github.com/proofofjapan-web/POJ1 |

> **To run locally:** See [Local Setup](#local-setup) below.

---

## Hackathon Requirements Checklist

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| AI agent performs a task and settles on Kite chain | ✅ | ZUKKU LLM agent + Kite Passport x402 settlement |
| Executes paid actions (API calls, services, transactions) | ✅ | `finalizeBooking()` → USDC payment to merchant wallet |
| Works end-to-end in production | ✅ | Deployed on Cloudflare Pages (global edge) |
| Uses Kite chain for attestations (proof, auditability) | ✅ | Kite Agent Passport with session token + agent_id |
| Functional UI — web app | ✅ | Full SPA: voice + text input, animated ZUKKU agent |
| Demo publicly accessible | ✅ | Cloudflare Pages public URL |

---

## Architecture

```
User (Voice / Text)
        │
        ▼
┌───────────────────────┐
│  ZUKKU Agent (LLM)    │  ← Cloudflare Workers AI (llama-3.3-70b)
│  Hono / CF Pages      │
└──────────┬────────────┘
           │  x402 Protocol
           ▼
┌───────────────────────┐
│  Kite Agent Passport  │  ← agent_token, session, 24h budget cap
│  Autonomous Payments  │
└──────────┬────────────┘
           │  A2A Settlement (USDC)
           ▼
┌─────────────────────────────────────────────────┐
│  Merchant Wallets (A2A)                         │
│  縄文庵  0x13D8D465285f39F53eB4C10e953258a72587B388 │
│  白雲荘  0xa5974eb874252E32e9DE43E93eAf8c93499693a4 │
│  海音   0xCd2f61E96b810887429f25071ca34625735b5e83  │
└─────────────────────────────────────────────────┘
```

**Key Files:**
```
webapp/
├── src/index.tsx          # Entire application (Hono backend + frontend SPA)
├── public/static/
│   ├── zukku_blue.png     # ZUKKU real product photo (blue)
│   └── zukku_red.png      # ZUKKU real product photo (red)
├── wrangler.jsonc         # Cloudflare Pages configuration
├── ecosystem.config.cjs   # PM2 config (local dev)
└── package.json
```

---

## Agent Autonomy — How It Works

### 1. Session Initialization
User sets a **per-transaction budget cap** (e.g. $50). ZUKKU's Kite Passport is activated with:
- `agent_token` (from `.kpass/agent.json`)
- 24-hour session window
- Maximum spend limit per autonomous action

### 2. Preference Gathering (DIALOGUE RULES)
ZUKKU asks **at least 2 preference questions** before suggesting anything:
- "Who are you traveling with?"
- "Do you prefer nature or culture?"
- "Any must-have — onsen, gourmet, adventure?"

### 3. Experience Selection & Payment
```
selectExperience(id)
  └─→ requiresApproval check
       ├─ true  → show authorization UI + user confirms
       └─ false → auto-proceed
           └─→ finalizeBooking()
                ├─ A2A payment to merchant wallet (USDC via x402)
                ├─ flashKitePanel() — visual confirmation
                └─ speak("Booking complete via Kite Passport")
```

### 4. Auto-Purchase (Agentic Commerce)
After booking, ZUKKU autonomously suggests and purchases travel essentials:
- Trekking socks, eco-bags, local snacks
- Only if item cost ≤ budget cap
- User is notified before auto-purchase executes

---

## Key Technical Features

| Feature | Technology |
|---------|-----------|
| LLM Agent | Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| Payment Protocol | Kite Passport x402 (USDC) |
| A2A Settlement | 3 merchant wallets, autonomous dispatch |
| Voice I/O | Web Speech API (TTS en-US "Zooku" pronunciation fix) |
| Text I/O | Text input field + `sendTextMessage()` |
| Frontend | Vanilla JS + TailwindCSS (CDN) |
| Backend | Hono on Cloudflare Workers |
| Double-tap Guard | `_selectExpLock` mutex |
| Kite Panel UX | `flashKitePanel()` green glow on payment |

---

## TTS Pronunciation Note

ZUKKU is pronounced **"ZOO-koo"** in English.  
`preprocessTTS()` converts all variants → `"Zooku"` before passing to Web Speech API (`en-US`):
```javascript
text.replace(/ZUKKU/gi, 'Zooku')
    .replace(/ずっく/g, 'Zooku')
```

---

## A2A Merchant Wallets

| Inn | Short Name | Wallet Address |
|-----|-----------|---------------|
| Yakushima Forest Lodge Jomonan | 縄文庵 | `0x13D8D465285f39F53eB4C10e953258a72587B388` |
| Okuhida Hakuunsou Mountain Inn | 白雲荘 | `0xa5974eb874252E32e9DE43E93eAf8c93499693a4` |
| Goto Islands Tsubaki Inn Kaine | 海音 | `0xCd2f61E96b810887429f25071ca34625735b5e83` |

---

## Local Setup

### Prerequisites
- Node.js 18+
- npm 9+
- Wrangler CLI (`npm i -g wrangler`)
- PM2 (`npm i -g pm2`)

### Steps

```bash
# 1. Clone
git clone https://github.com/proofofjapan-web/POJ1.git
cd POJ1

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Start dev server
pm2 start ecosystem.config.cjs
# → http://localhost:3000

# OR one-liner:
npm run dev:sandbox
```

### Kite Passport Setup (for live payments)
```bash
# Follow: https://docs.gokite.ai/kite-agent-passport/beginner-setup
# Place credentials in:
#   .kpass/config.json   ← user JWT, user_id, email
#   .kpass/agent.json    ← agent_token, agent_id
```

---

## Deployment (Cloudflare Pages)

```bash
# Authenticate
npx wrangler login

# Build + Deploy
npm run deploy
# → https://flattora.pages.dev
```

---

## User Guide

1. **Open the app** → ZUKKU greets you
2. **Set your budget** → Click the budget modal, enter per-transaction cap (e.g. $50)
3. **Tell ZUKKU what you want** → Voice or text: *"I want a quiet onsen retreat"*
4. **ZUKKU asks questions** → Answer 2–3 preference questions
5. **Choose an experience** → Click a card; ZUKKU shows price + details
6. **Approve payment** → Tap "Authorize" → Kite Passport settles on-chain
7. **ZUKKU handles the rest** → Auto-books essentials within your budget cap

---

## Team

**Flattora** — Built for Kite AI Global Hackathon 2026  
Product: ZUKKU travel concierge robot by [Hatapro](https://hatapro.jp)  
Tech: Hono + Cloudflare Workers + Kite Passport

---

## License

MIT
