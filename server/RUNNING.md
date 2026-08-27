# Running QuickDine

You need **two terminals**. Both must stay open.

## Terminal 1 — API (FastAPI, port 8000)

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
Check it: <http://localhost:8000/api/health> should print `{"status":"ok"}`.
Interactive API docs (every endpoint, try-it-out included): <http://localhost:8000/docs>

On first start the database is created **and seeded** with demo accounts,
six restaurants, reviews and sample bookings. Seeding is skipped on every
later start, so your own data is never overwritten.

## Terminal 2 — Client (Vite, port 5173)

```bash
cd Client
npm install
npm run dev
```

Open the URL Vite prints (usually <http://localhost:5173>).

---

## Demo accounts

| Role      | Email                   | Password    | What you'll see                               |
| --------- | ----------------------- | ----------- | --------------------------------------------- |
| **Admin** | `admin@quickdine.com`   | `admin1234` | Approvals queue + platform analytics          |
| **Owner** | `owner@quickdine.com`   | `owner1234` | Restaurant portal for L'Essence, with bookings |
| **Owner** | `elena@quickdine.com`   | `owner1234` | Owns Terraza Cielo + a *pending* venue         |
| **Diner** | `diner@quickdine.com`   | `diner1234` | Upcoming reservations + dining history        |
| **Diner** | `emily@quickdine.com`   | `diner1234` | A past visit and a review                     |

You can also press **SIGN UP** and make your own account. Ticking the owner
option during sign-up creates a partner account; `admin` can never be
self-assigned from the form.

### Suggested walkthrough

1. Sign up as a **new owner** → you land on the setup wizard → fill it in and
   submit. Your venue is now *pending* and invisible to diners.
2. Sign in as **admin** → Approvals tab → approve it.
3. Sign in as a **diner** → search for it → pick a date and time → book.
4. Back as the **owner** → the reservation is in your Bookings tab → mark it
   completed or cancel it.

---

## What the API provides

Base URL `http://localhost:8000/api`. Everything except browsing is authenticated
with `Authorization: Bearer <token>`.

**Auth** — `POST /auth/register`, `POST /auth/login`, `GET /auth/me`,
`PUT /auth/me`, `PUT /auth/password`

**Restaurants (public)** — `GET /restaurants` (search, location, cuisine,
priceRange, sort), `GET /restaurants/featured`, `GET /restaurants/{slug}`,
`GET /restaurants/{slug}/availability?date=`

**Reviews** — `GET /restaurants/{slug}/reviews`, `POST /restaurants/{slug}/reviews`

**Bookings (diner)** — `GET /bookings`, `GET /bookings/{id}`, `POST /bookings`,
`PUT /bookings/{id}`, `PATCH /bookings/{id}/cancel`, `DELETE /bookings/{id}`

**Owner** — `GET|POST|PUT|DELETE /owner/restaurant`, `GET /owner/bookings`,
`PATCH /owner/bookings/{id}/status`, `GET /owner/stats`

**Admin** — `GET /admin/restaurants`, `PATCH /admin/restaurants/{id}/status`,
`DELETE /admin/restaurants/{id}`, `GET /admin/users`,
`PATCH /admin/users/{id}/role`, `GET /admin/stats`

---

## Tests

With the API running in Terminal 1:

```bash
cd server
python smoke_test.py        # 96 checks: every endpoint, permissions, validation
node integration_test.mjs   # 41 checks: full diner / owner / admin journeys
```

Both should end with `0 failed`.

---

## Troubleshooting

**`TypeError: Failed to fetch` / `ERR_CONNECTION_REFUSED`**
The API isn't running. Check Terminal 1 — <http://localhost:8000/api/health>
must respond.

**`Access to fetch ... blocked by CORS policy`**
Your dev origin isn't allowed. `main.py` accepts `localhost` and `127.0.0.1`
on ports 5170-5179, 3000-3009 and 4173. If Vite printed something else, add it
to `allow_origin_regex` in `main.py`.

**Vite says "Port 5173 is in use, using 5174"**
That's fine — 5174 is already allowed.

**`uvicorn: command not found`**
The venv isn't activated. Run `.venv\Scripts\activate` (Windows) or
`source .venv/bin/activate` first — the prompt should show `(.venv)`.

**Port 8000 already in use**
Windows: `netstat -ano | findstr :8000` then `taskkill /PID <pid> /F`.
macOS/Linux: `lsof -ti:8000 | xargs kill -9`.

**I want a clean database**
Stop the API, delete `server/quickdine.db`, and start it again — it re-seeds.
Or run `python seed.py --reset`.

**Uploaded restaurant photos don't appear**
They're served from the API at `/uploads/...`. If you deploy the API somewhere
other than localhost:8000, set `PUBLIC_URL` (see `server/.env.example`) so the
image URLs point at the right host.

---

## Notes

- **Auth** is real: passwords are hashed with PBKDF2-HMAC-SHA256 (260k rounds,
  per-user salt) and never leave the database. Sessions are JWTs valid for 7
  days. Set `JWT_SECRET` in the environment for anything beyond local dev —
  without it a random secret is generated at boot, so tokens stop working after
  a restart (safe, but you'll be signed out).
- **Roles** are enforced server-side, not just in the UI. A diner calling an
  owner endpoint gets 403; asking for someone else's booking gets 404 rather
  than 403, so the API doesn't confirm that the record exists.
- **Capacity is real.** Each slot tracks booked covers against the venue's
  seat count, and overbooking is refused with the number of seats left.
  Cancelling frees the seats again.
- **Restaurant photos** upload to `server/uploads/`. The six seeded venues use
  the images already in `Client/public/`.
- `quickdine.db` is a SQLite file created automatically. If you change the
  models, delete it and restart — SQLModel creates tables but does not migrate
  existing ones.
