# QuickDine

A full-stack restaurant reservation platform. Diners browse and book tables, restaurant owners manage their venue and its bookings, and admins approve new venues and monitor the platform.

- **Client** — React 19 + TypeScript + Vite + Tailwind CSS v4
- **Server** — FastAPI + SQLModel on SQLite, JWT authentication

---

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Demo login accounts](#demo-login-accounts)
- [Suggested walkthrough](#suggested-walkthrough)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [API overview](#api-overview)
- [Tests](#tests)
- [Troubleshooting](#troubleshooting)
- [Notes on how it works](#notes-on-how-it-works)

---

## Requirements

| Tool    | Version                                  |
| ------- | ---------------------------------------- |
| Python  | 3.11 or newer (the venv here was 3.14)   |
| Node.js | 20 or newer                              |
| npm     | Ships with Node                          |

No external database is needed — SQLite creates `server/quickdine.db` on first run.

---

## Quick start

You need **two terminals**, and both must stay open.

### Terminal 1 — API (FastAPI, port 8000)

**Windows**

```bat
cd server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**macOS / Linux**

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Wait for `Uvicorn running on http://127.0.0.1:8000`.

- Health check: <http://localhost:8000/api/health> should return `{"status":"ok"}`
- Interactive API docs: <http://localhost:8000/docs>

On the very first start the database is created **and seeded** with the demo accounts, six restaurants, reviews and sample bookings. Seeding is skipped on every later start, so your own data is never overwritten.

### Terminal 2 — Client (Vite, port 5173)

```bash
cd Client
npm install
npm run dev
```

Open the URL Vite prints, usually <http://localhost:5173>.

---

## Demo login accounts

All of these are created by the seeder on first API start. Sign in from the **SIGN IN** button in the navbar.

| Role      | Email                 | Password    | What you'll see                                |
| --------- | --------------------- | ----------- | ---------------------------------------------- |
| **Admin** | `admin@quickdine.com` | `admin1234` | Approvals queue, user management, platform stats |
| **Owner** | `owner@quickdine.com` | `owner1234` | Restaurant portal for L'Essence, with bookings   |
| **Owner** | `elena@quickdine.com` | `owner1234` | Owns Terraza Cielo plus a *pending* venue        |
| **Diner** | `diner@quickdine.com` | `diner1234` | Upcoming reservations and dining history         |
| **Diner** | `emily@quickdine.com` | `diner1234` | A past visit and a review                        |

You can also press **SIGN UP** and create your own account. Ticking the owner option during sign-up creates a partner account. The `admin` role can never be self-assigned from the form — it only exists in the seed data or via an existing admin.

> These credentials are development-only. Change them in `server/seed.py` before deploying anywhere.

Where each role lands after signing in:

| Role  | Route                | Page                                                     |
| ----- | -------------------- | -------------------------------------------------------- |
| Diner | `/dashboard`         | Reservations, history, profile                            |
| Owner | `/owner/dashboard`   | Venue setup wizard, bookings, stats                       |
| Admin | `/admin/dashboard`   | Pending venue approvals, users, analytics                 |

---

## Suggested walkthrough

1. Sign up as a **new owner** → you land on the setup wizard → fill it in and submit. Your venue is now *pending* and invisible to diners.
2. Sign in as **admin** → Approvals tab → approve it. (Casa Verde is seeded as pending too, so the queue is never empty.)
3. Sign in as a **diner** → search for the venue → pick a date and time → book.
4. Back as the **owner** → the reservation appears in the Bookings tab → mark it completed or cancel it.

---

## Environment variables

Both are optional for local development. Copy the example files if you need to change anything.

**`server/.env`** (from `server/.env.example`)

```
JWT_SECRET=change-me-to-a-long-random-string
PUBLIC_URL=http://localhost:8000
```

- `JWT_SECRET` — without it, a random secret is generated at boot, so everyone is signed out whenever the API restarts. Set it for anything beyond local dev.
- `PUBLIC_URL` — the host that uploaded restaurant photos are served from. Change it if the API isn't on `localhost:8000`.

**`Client/.env.local`** (from `Client/.env.example`)

```
VITE_API_URL=http://localhost:8000/api
```

Only needed if the API isn't on the default port.

---

## Project structure

```
QD/
├── Client/                     # React + Vite frontend
│   ├── public/                 # Static assets and seeded restaurant images
│   ├── src/
│   │   ├── api.ts              # Typed API client (axios)
│   │   ├── App.tsx             # Routes
│   │   ├── components/
│   │   │   ├── admin/          # Approvals, users, stats
│   │   │   ├── booking/        # Booking form, summary, success
│   │   │   ├── chat/           # Chatbot engine and types
│   │   │   ├── effects/        # Splash screen, cursor, transitions
│   │   │   ├── home/           # Hero, trending, cuisines, membership
│   │   │   ├── owner/          # Venue wizard, bookings, approval states
│   │   │   └── restaurant/     # Detail hero, info, reviews, booking widget
│   │   ├── context/            # AppContext (auth/session), ThemeContext
│   │   └── pages/              # Home, Search, RestaurantDetail, dashboards
│   └── vercel.json             # SPA rewrite for deploys
└── server/                     # FastAPI backend
    ├── main.py                 # App setup, CORS, static uploads, routers
    ├── models.py               # SQLModel tables + request schemas
    ├── serializers.py          # snake_case DB → camelCase API responses
    ├── auth.py                 # Password hashing and JWT handling
    ├── database.py             # Engine and init
    ├── helpers.py              # Slugs, booking references, upload paths
    ├── seed.py                 # Demo accounts, venues, reviews, bookings
    ├── routers/                # auth, restaurants, bookings, owner, admin
    ├── uploads/                # Uploaded cover images
    ├── smoke_test.py
    └── integration_test.mjs
```

---

## API overview

Base URL `http://localhost:8000/api`. Everything except browsing requires an `Authorization: Bearer <token>` header. Full interactive docs with try-it-out are at <http://localhost:8000/docs>.

**Auth** — `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PUT /auth/me`, `PUT /auth/password`

**Restaurants (public)** — `GET /restaurants` (search, location, cuisine, priceRange, sort), `GET /restaurants/featured`, `GET /restaurants/{slug}`, `GET /restaurants/{slug}/availability?date=`

**Reviews** — `GET /restaurants/{slug}/reviews`, `POST /restaurants/{slug}/reviews`

**Bookings (diner)** — `GET /bookings`, `GET /bookings/{id}`, `POST /bookings`, `PUT /bookings/{id}`, `PATCH /bookings/{id}/cancel`, `DELETE /bookings/{id}`

**Owner** — `GET|POST|PUT|DELETE /owner/restaurant`, `GET /owner/bookings`, `PATCH /owner/bookings/{id}/status`, `GET /owner/stats`

**Admin** — `GET /admin/restaurants`, `PATCH /admin/restaurants/{id}/status`, `DELETE /admin/restaurants/{id}`, `GET /admin/users`, `PATCH /admin/users/{id}/role`, `GET /admin/stats`

---

## Tests

With the API running in Terminal 1:

```bash
cd server
python smoke_test.py        # 96 checks: every endpoint, permissions, validation
node integration_test.mjs   # 41 checks: full diner / owner / admin journeys
```

Both should end with `0 failed`.

Frontend lint and production build:

```bash
cd Client
npm run lint
npm run build
```

---

## Troubleshooting

**`TypeError: Failed to fetch` / `ERR_CONNECTION_REFUSED`**
The API isn't running. Check Terminal 1 — <http://localhost:8000/api/health> must respond.

**`Access to fetch ... blocked by CORS policy`**
Your dev origin isn't allowed. `main.py` accepts `localhost` and `127.0.0.1` on ports 5170–5179, 3000–3009 and 4173. If Vite printed something else, add it to `allow_origin_regex` in `main.py`.

**Vite says "Port 5173 is in use, using 5174"**
That's fine — 5174 is already allowed.

**`uvicorn: command not found`**
The venv isn't activated. Run `.venv\Scripts\activate` (Windows) or `source .venv/bin/activate` first — your prompt should show `(.venv)`.

**Port 8000 already in use**
Windows: `netstat -ano | findstr :8000` then `taskkill /PID <pid> /F`.
macOS/Linux: `lsof -ti:8000 | xargs kill -9`.

**I want a clean database**
Stop the API, delete `server/quickdine.db`, and start it again — it re-seeds. Or run `python seed.py --reset`.

**Uploaded restaurant photos don't appear**
They're served from the API at `/uploads/...`. If the API isn't on `localhost:8000`, set `PUBLIC_URL` so the image URLs point at the right host.

---

## Notes on how it works

- **Auth is real.** Passwords are hashed with PBKDF2-HMAC-SHA256 (260k rounds, per-user salt) and never leave the database. Sessions are JWTs valid for 7 days.
- **Roles are enforced server-side**, not just in the UI. A diner calling an owner endpoint gets a 403; asking for someone else's booking returns 404 rather than 403, so the API doesn't confirm the record exists.
- **Capacity is real.** Each slot tracks booked covers against the venue's seat count, and overbooking is refused with the number of seats left. Cancelling frees the seats again.
- **Venue approval.** New restaurants start as `pending` and are invisible to diners until an admin approves them.
- **Restaurant photos** upload to `server/uploads/`. The six seeded venues use the images already in `Client/public/`.
- **`quickdine.db`** is a SQLite file created automatically. If you change the models, delete it and restart — SQLModel creates tables but does not migrate existing ones.
