from sqlmodel import SQLModel, Field
from typing import Optional

class Booking(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    date: str
    time: str
    guests: int