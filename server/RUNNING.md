# Running QuickDine

You need **two terminals**. Both must stay open.

## Terminal 1 — API (FastAPI, port 8000)

```bat
cd server
.venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

Wait for `Uvicorn running on http://127.0.0.1:8000`.
Check it in a browser: <http://localhost:8000/api/health> should print `{"status":"ok"}`.
Interactive API docs: <http://localhost:8000/docs>

If the venv is missing or broken, rebuild it:

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Terminal 2 — Client (Vite, port 5173)

```bat
cd Client
npm install
npm run dev
```

Open the URL Vite prints (usually <http://localhost:5173>).

---

## Troubleshooting

**`TypeError: Failed to fetch` / `ERR_CONNECTION_REFUSED`**
The API isn't running. Check Terminal 1 — <http://localhost:8000/api/health> must respond.

**`Access to fetch ... blocked by CORS policy`**
Your dev origin isn't allowed. `main.py` accepts `localhost` and `127.0.0.1` on
ports 5173-5179 and 3000. If Vite printed something else, add it to
`allow_origin_regex` in `main.py`.

**Vite says "Port 5173 is in use, using 5174"**
That's fine — 5174 is already allowed.

**`uvicorn: command not found`**
The venv isn't activated. Run `.venv\Scripts\activate` first (prompt shows `(.venv)`).

**Port 8000 already in use**
`netstat -ano | findstr :8000` then `taskkill /PID <pid> /F`.

---

## Accounts

There are no pre-made accounts. Click **SIGN UP**, enter your own name, email,
phone and a password of at least 8 characters. That account is stored (hashed)
in `booking.db` and you sign in with it from then on.

Bookings belong to the account that made them, so two accounts never see each
other's reservations.

If you change the models, delete `booking.db` and restart — SQLModel creates
tables but does not migrate existing ones.

## Notes

- There is **no Node server**. `server.ts` (Express, port 5000) was a leftover that
  served no API routes — running it was why nothing connected. It has been removed.
- Auth and bookings are real (SQLite). The restaurant catalogue itself is still
  static data in `Client/src/assets/assets.ts` — bookings store a `restaurant_slug`
  and the client joins it back for images and cuisine.
- `booking.db` is a SQLite file created automatically on first startup.
