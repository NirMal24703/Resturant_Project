"""Register, sign in, restore session, and account self-service."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from auth import (
    create_token,
    get_current_user,
    get_user_by_email,
    hash_password,
    verify_password,
)
from database import get_session
from models import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    UpdateProfileRequest,
    User,
    utcnow,
)
from serializers import user_public

router = APIRouter(prefix="/api/auth", tags=["auth"])

MIN_PASSWORD_LENGTH = 8


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, session: Session = Depends(get_session)):
    if get_user_by_email(session, body.email):
        raise HTTPException(status_code=409, detail="That email is already registered. Try signing in.")

    if len(body.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")

    if not body.name.strip():
        raise HTTPException(status_code=422, detail="Please enter your name.")

    user = User(
        name=body.name.strip(),
        email=body.email.lower().strip(),
        phone=(body.phone or "").strip() or None,
        # Only 'user' and 'owner' can be self-assigned. Admin is granted by
        # seeding or by another admin, never by whatever the form posts.
        role=body.role if body.role in ("user", "owner") else "user",
        password_hash=hash_password(body.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return {"token": create_token(user.id), "user": user_public(user)}


@router.post("/login")
def login(body: LoginRequest, session: Session = Depends(get_session)):
    user = get_user_by_email(session, body.email)

    # Identical message either way, so this can't be used to discover which
    # emails have accounts.
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    return {"token": create_token(user.id), "user": user_public(user)}


@router.get("/me")
def me(current: User = Depends(get_current_user)):
    """Called on page load to exchange a stored token for the live account."""
    return user_public(current)


@router.put("/me")
def update_profile(
    body: UpdateProfileRequest,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(status_code=422, detail="Name can't be empty.")
        current.name = body.name.strip()
    if body.phone is not None:
        current.phone = body.phone.strip() or None

    current.updated_at = utcnow()
    session.add(current)
    session.commit()
    session.refresh(current)
    return user_public(current)


@router.put("/password")
def change_password(
    body: ChangePasswordRequest,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not verify_password(body.current_password, current.password_hash):
        raise HTTPException(status_code=401, detail="Your current password is incorrect.")

    if len(body.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=422, detail="New password must be at least 8 characters.")

    current.password_hash = hash_password(body.new_password)
    current.updated_at = utcnow()
    session.add(current)
    session.commit()

    # Re-issue so the current tab keeps working after the change.
    return {"token": create_token(current.id), "user": user_public(current)}
