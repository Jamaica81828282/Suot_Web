<div align="center">

<img src="src/auth/Logo/logo.jpg" alt="Suot Logo" width="100" style="border-radius:20px"/>

## Documentation
[→ View Architecture Doc](https://jamaica81828282.github.io/Suot/architecture.html)
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
![WebRTC](https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white)

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

- **Swap System** — Item-for-item, item + points, OTP confirmation to verify physical exchange
- **Pasa-Points Wallet** — Active balance capped at 2,500 pts with auto-refilling circulation buffer; buffer expires in 30 days to encourage active swapping
- **Transaction History** — Full wallet event log (top-ups, overflows, refills, spends, earns) with type badges
- **Community Feed** — OOTDs, stories, and linked items with emoji reactions, hashtag filters, and a Friends/Discover panel
- **Meetup Map** — Leaflet-powered pin for preferred swap meetup locations with address search and reverse geocoding
- **AI Price Suggester** — Gemini API recommends fair Pasa-Points pricing based on item details and Philippine secondhand market
- **Real-time Messaging** — Live chat with swap offer cards, emoji reactions, image sharing, and typing indicators
- **Peer-to-Peer Video Calls** — Native WebRTC video calling (no third-party service) with ringing, mic/camera toggles, call duration, and in-chat call history messages
- **OTP Swap Confirmation** — 4-digit code exchange to confirm physical swaps
- **Friends & Discovery** — Follow system with online presence indicators and suggested people
- **Notifications** — Bell dropdown with per-type icons (likes, follows, swaps, comments, wishlists)
- **Distance Filter** — Geolocation-based catalog sorting with configurable radius chips

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (ES Modules) |
| Backend / Database | [Supabase](https://supabase.com) — PostgreSQL, Auth, Storage, Realtime Broadcast |
| Maps | [Leaflet.js](https://leafletjs.com) + OpenStreetMap + Nominatim |
| Video Calls | Native WebRTC (RTCPeerConnection) + Supabase Broadcast signaling + OpenRelay TURN |
| AI Pricing | Google Gemini API `gemini-2.0-flash` |
| Fonts | Google Fonts — Great Vibes, Playfair Display, Inter, DM Sans |

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

### 4. Set up the database
Run the following SQL files in order in your Supabase SQL Editor:

1. `docs/documents/supabase-schema.sql` — core tables
2. `docs/documents/home-feed-v2.sql` — post reactions, hashtags, linked items
3. `docs/documents/wallet-circulation.sql` — circulation buffer, 30-day expiry trigger, wallet events log

Required tables: `profiles`, `items`, `swaps`, `messages`, `wishlist`, `follows`, `notifications`, `wallet_events`, `post_reactions`, `stories`

Required storage buckets *(set to Public)*: `item-images`, `post-images`

### 5. Run
Right-click `src/auth/login.html` → **Open with Live Server**

> **Note on video calls:** WebRTC requires HTTPS in production. On localhost with Live Server, calls work between two tabs on the same machine. For calls between different devices on the same network, use a tool like [ngrok](https://ngrok.com) or deploy to a host with HTTPS.

---

## Wallet Circulation Rules

| Rule | Detail |
|---|---|
| Active wallet cap | 2,500 pts |
| Overflow | Any top-up exceeding 2,500 pts moves the excess to the Circulation Buffer automatically |
| Auto-refill | When active pts drop to ≤ 500 and the buffer has funds, active is topped back up to 2,500 |
| Buffer expiry | Circulation buffer balance expires **30 days** after it is received — use it or lose it |
| All movements logged | Every overflow, refill, spend, earn, and top-up is recorded in `wallet_events` |

---

## Video Call Architecture

Video calls use **native browser WebRTC** with **Supabase Realtime Broadcast** as the signaling channel — no third-party video service, no meeting codes, no accounts needed.


TURN relay servers (OpenRelay) are included as fallback for networks where direct P2P is blocked by NAT.

---

<div align="center">

Built for **SYSTEM INTEGRATION & ARCHITECTURE** &nbsp;·&nbsp; © 2025 Suot &nbsp;·&nbsp; Academic Use Only

</div>