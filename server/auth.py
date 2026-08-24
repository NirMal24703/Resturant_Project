"""Password hashing and JWT issuing/verifying."""

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from database import get_session
from models import User

# In production set JWT_SECRET as a real environment variable. The random
# fallback means tokens simply stop working after a restart, which is safe.
SECRET_KEY = os.getenv("JWT_SECRET", secrets.token_hex(32))
ALGORITHM = "HS256"
TOKEN_TTL_DAYS = 7

_PBKDF2_ROUNDS = 260_000
bearer = HTTPBearer(auto_error=False)


# ── Passwords ───────────────────────────────────────────────────────────────
# PBKDF2-HMAC-SHA256 from the standard library: no native build step, so it
# installs cleanly on Windows without a compiler.

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${_PBKDF2_ROUNDS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, rounds, salt, expected = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(rounds))
    except (ValueError, AttributeError):
        return False
    # Constant-time compare so timing can't leak the hash.
    return hmac.compare_digest(digest.hex(), expected)


# ── Tokens ──────────────────────────────────────────────────────────────────

def create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    session: Session = Depends(get_session),
) -> User:
    """Resolves the Authorization: Bearer <token> header into a User row."""
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not signed in, or the session has expired.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise invalid

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise invalid

    user = session.get(User, user_id)
    if user is None:
        raise invalid
    return user


def get_user_by_email(session: Session, email: str) -> Optional[User]:
    return session.exec(select(User).where(User.email == email.lower().strip())).first()
