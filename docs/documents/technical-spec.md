# Suot — Technical Specification

## System Architecture
Suot is a client-side web application backed by Supabase (BaaS).
All business logic runs in the browser via ES Modules.

## Database Schema Summary

### profiles
Extends Supabase auth.users. Stores display name, avatar, pts balance, circulation buffer.

### items
Clothing listings with images (stored in Supabase Storage), category, condition, size, pts price, and optional meetup lat/lng.

### swaps
Tracks swap offers between users. Statuses: `pending → otp_pending → swapped / declined / cancelled`.

### messages
Chat messages between users. Supports types: `text`, `image`, `swap_request`, `swap_accepted`, `swap_declined`, `swap_swapped`.

### wallet_events
Ledger of all point movements. Event types: `topup`, `overflow`, `refill`, `spend`, `earn`, `expired`.

### notifications
In-app notification feed. Types: `like`, `comment`, `reply`, `follow`, `friend`, `swap`, `story`, `wishlist`.

## Points System Rules
- Active wallet cap: **2,500 pts**
- Points beyond cap overflow to **Circulation Buffer**
- Buffer auto-refills active wallet when pts ≤ 500
- Buffer entries expire after **30 days**
- Points reserved on swap offer, refunded on decline/cancel

## API Integrations
- **Supabase** — Auth, Database, Storage, Realtime
- **Leaflet + OpenStreetMap** — Free map rendering (no API key required)
- **Nominatim** — Free reverse geocoding
- **Google Gemini** — AI-powered price suggestionsgit add docs/