from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from typing import List

from database import init_db, get_session
from models import Booking

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # your Vite React dev URL
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/api/bookings", response_model=List[Booking])
def get_bookings(session: Session = Depends(get_session)):
    return session.exec(select(Booking)).all()

@app.get("/api/bookings/{booking_id}", response_model=Booking)
def get_booking(booking_id: int, session: Session = Depends(get_session)):
    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking

@app.post("/api/bookings", response_model=Booking)
def create_booking(booking: Booking, session: Session = Depends(get_session)):
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking

@app.put("/api/bookings/{booking_id}", response_model=Booking)
def update_booking(booking_id: int, updated: Booking, session: Session = Depends(get_session)):
    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking.name = updated.name
    booking.date = updated.date
    booking.time = updated.time
    booking.guests = updated.guests
    session.commit()
    session.refresh(booking)
    return booking

@app.delete("/api/bookings/{booking_id}")
def delete_booking(booking_id: int, session: Session = Depends(get_session)):
    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    session.delete(booking)
    session.commit()
    return {"message": "Booking deleted"}