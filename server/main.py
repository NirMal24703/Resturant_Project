"""QuickDine API — FastAPI + SQLite.

Run it with:  uvicorn main:app --reload --port 8000
Interactive docs:  http://localhost:8000/docs
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from database import init_db
from helpers import UPLOAD_DIR
from routers import admin_routes, auth_routes, booking_routes, owner_routes, restaurant_routes
from seed import seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    seed()  # No-op once the database already has accounts in it.
    yield


app = FastAPI(
    title="QuickDine API",
    description="Auth, restaurants, reservations, reviews and admin for the QuickDine client.",
    version="1.0.0",
    lifespan=lifespan,
)

# Vite may land on 5173, 5174, 5175... if a port is taken, and the browser
# treats localhost and 127.0.0.1 as different origins. Match all of them.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):(517\d|300\d|4173)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploaded cover images are served straight off disk at /uploads/<file>.
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(auth_routes.router)
app.include_router(restaurant_routes.router)
app.include_router(booking_routes.router)
app.include_router(owner_routes.router)
app.include_router(admin_routes.router)


@app.exception_handler(Exception)
async def unhandled_error(_: Request, exc: Exception):
    """Never leak a stack trace to the browser; the console still gets it."""
    import traceback

    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong on the server. Check the API terminal for details."},
    )


@app.get("/api/health", tags=["health"])
def health():
    """Quick check that the API is up: http://localhost:8000/api/health"""
    return {"status": "ok"}
