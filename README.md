# Suot 👗♻️
> *Style passed on.*

Suot is a peer-to-peer fashion swapping platform for the Philippines, built to make sustainable style accessible. Users list pre-loved clothing, earn Pasa-Points, and swap with others in their community — no cash needed.

---

## 🌍 SDG Alignment & Problem Statement

**SDG 12 — Responsible Consumption and Production**

The fashion industry is one of the world's largest polluters. In the Philippines, fast fashion drives overconsumption while perfectly wearable clothes end up in landfills. Suot tackles this by creating a circular fashion economy — giving clothes a second life through community-based swapping instead of buying new.

**The Problem:**
- Filipinos discard thousands of clothing items yearly due to changing trends
- Thrift and swap culture exists but has no dedicated digital platform
- No accessible, trusted, gamified space for clothing exchange in PH

**Our Solution:**
A social fashion swap app where users earn and spend *Pasa-Points* to trade items, connect with nearby swappers, and build a sustainable wardrobe together.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES Modules) |
| Backend / Database | [Supabase](https://supabase.com) (PostgreSQL + Auth + Storage + Realtime) |
| Maps | [Leaflet.js](https://leafletjs.com) + OpenStreetMap + Nominatim |
| AI Pricing | Google Gemini API (`gemini-2.0-flash`) |
| Fonts | Google Fonts (Great Vibes, Playfair Display, DM Sans, Inter) |
| Hosting | GitHub Pages / any static host |

---


## ⚙️ How to Run / Install (For Developers)

### Prerequisites
- A [Supabase](https://supabase.com) account and project
- A [Google AI Studio](https://aistudio.google.com) API key (for AI pricing feature)
- Any static file server (VS Code Live Server, `npx serve`, etc.)

### 1. Clone the repo
```bash
git clone https://github.com/yourusername/suot.git
cd suot
```

### 2. Configure Supabase
Open `src/db/supabase.js` and replace the placeholder values:
```js
const SUPABASE_URL = 'https://your-project.supabase.co'
const SUPABASE_ANON_KEY = 'your-anon-key-here'
```

### 3. Configure Gemini AI (optional)
In `src/personal/` create a `config.js` file:
```js
const CONFIG = {
  GEMINI_API_KEY: 'your-gemini-api-key-here'
}
```

### 4. Set up Supabase tables
Run the SQL migrations in `docs/documents/supabase-schema.sql` in your Supabase SQL editor.

Required tables:
- `profiles` — user info, pts balance
- `items` — listed clothing items
- `swaps` — swap requests and status
- `messages` — chat between users
- `wishlist` — saved items
- `follows` — follower/following relationships
- `notifications` — in-app alerts
- `wallet_events` — points transaction history
- `stories` — 24-hour community stories

Required Storage buckets:
- `item-images` — set to **Public**
- `post-images` — set to **Public**

### 5. Run the app
```bash
# Using VS Code Live Server — right-click src/auth/login.html → Open with Live Server
# Or using npx:
npx serve src
```

Then open `http://localhost:3000/auth/login.html`

---
## 🌐 Live Demo
Visit: https://jamaica81828282.github.io/Suot_Web

> Create these accounts in your Supabase Auth dashboard under **Authentication → Users**.

---

## ✨ Key Features

- **Swap System** — Send item-for-item, item + points, or points-only offers
- **Pasa-Points Wallet** — Capped at 2,500 pts with auto-refilling circulation buffer
- **Community Feed** — Post OOTDs, stories, and linked items with reactions & comments
- **Meetup Map** — Leaflet-powered pin for setting swap meetup locations
- **AI Price Suggester** — Gemini API recommends fair Pasa-Points pricing
- **Real-time Messaging** — Supabase Realtime powered chat with swap cards
- **OTP Swap Confirmation** — 4-digit code exchange to confirm physical swaps
- **Friends & Discovery** — Follow system with online presence indicators

---


## 📄 License

This project was built for academic purposes. All rights reserved © 2025 Suot Team.