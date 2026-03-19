<div align="center">

<img src="src/auth/Logo/logo.jpg" alt="Suot Logo" width="100" style="border-radius:20px"/>

# Suot
### *Style passed on.*

A peer-to-peer fashion swapping platform for the Philippines — swap pre-loved clothing, earn Pasa-Points, and build a sustainable wardrobe together.

<br/>

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Gemini_AI-4285F4?style=for-the-badge&logo=google&logoColor=white)

![Status](https://img.shields.io/badge/Status-Active-4A635D?style=flat-square)
![SDG](https://img.shields.io/badge/SDG_12-Responsible_Consumption-C994A7?style=flat-square)
![License](https://img.shields.io/badge/License-Academic-EBE0E3?style=flat-square)

</div>

---

## The Problem

The fashion industry is one of the world's largest polluters. In the Philippines, fast fashion drives overconsumption while perfectly wearable clothes pile up in landfills. Thrift and swap culture exists — but there's no trusted, gamified, digital space dedicated to it.

**SDG 12 — Responsible Consumption and Production**

Suot creates a circular fashion economy, giving clothes a second life through community-based swapping instead of buying new.

| Pain Point | How Suot Solves It |
|---|---|
| Clothes discarded due to trends | List and swap instead of throw away |
| No dedicated swap platform in PH | Purpose-built for Filipino swappers |
| Buying pre-loved feels risky | OTP verification + user ratings |
| Sustainability feels inaccessible | Gamified points make it fun |

---

## Features

- **Swap System** — Item-for-item, item + points, or points-only offers
- **Pasa-Points Wallet** — Capped at 2,500 pts with auto-refilling circulation buffer
- **Community Feed** — OOTDs, stories, and linked items with reactions and comments
- **Meetup Map** — Leaflet-powered pin for preferred swap meetup locations
- **AI Price Suggester** — Gemini API recommends fair Pasa-Points pricing
- **Real-time Messaging** — Live chat with swap offer cards built in
- **OTP Swap Confirmation** — 4-digit code exchange to confirm physical swaps
- **Friends & Discovery** — Follow system with online presence indicators

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (ES Modules) |
| Backend / Database | [Supabase](https://supabase.com) — PostgreSQL, Auth, Storage, Realtime |
| Maps | [Leaflet.js](https://leafletjs.com) + OpenStreetMap + Nominatim |
| AI Pricing | Google Gemini API `gemini-2.0-flash` |
| Fonts | Google Fonts — Great Vibes, Playfair Display, DM Sans |

---

## Project Structure

```
Suot_Web/
├── README.md
├── docs/
│   ├── diagrams/          # ERD, system architecture, user flow
│   └── documents/         # Technical spec, project proposal
└── src/
    ├── auth/              # Login & register
    ├── dashboard/         # Catalog, wallet, top-up
    ├── personal/          # Home, messages, post-item, item-detail, wishlist, friends
    ├── profile/           # User profile
    └── db/                # Supabase client & all DB helpers
```

---

## How to Run / Install (For Developers)

### Prerequisites
- [Supabase](https://supabase.com) account and project
- [Google AI Studio](https://aistudio.google.com) API key *(for AI pricing)*
- VS Code with Live Server extension

### 1. Clone the repo
```bash
git clone https://github.com/Jamaica81828282/Suot_Web.git
cd Suot_Web
```

### 2. Configure Supabase
Open `src/db/supabase.js` and replace:
```js
const SUPABASE_URL = 'https://your-project.supabase.co'
const SUPABASE_ANON_KEY = 'your-anon-key-here'
```

### 3. Configure Gemini AI
Create `src/personal/config.js`:
```js
const CONFIG = {
  GEMINI_API_KEY: 'your-gemini-api-key-here'
}
```
> `config.js` is in `.gitignore` — your key will never be pushed to GitHub.

### 4. Set up Supabase
Run `docs/documents/supabase-schema.sql` in your Supabase SQL editor.

Required tables: `profiles`, `items`, `swaps`, `messages`, `wishlist`, `follows`, `notifications`, `wallet_events`, `stories`

Required storage buckets *(set to Public)*: `item-images`, `post-images`

### 5. Run
Right-click `src/auth/login.html` → **Open with Live Server**

 

<div align="center">

Built for **SYSTEM INTEGRATION & ARCHITECTURE** &nbsp;·&nbsp; © 2025 Suot &nbsp;·&nbsp; Academic Use Only

</div>