from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = "sqlite:///./booking.db"
engine = create_engine(DATABASE_URL, echo=True, connect_args={"check_same_thread": False})

def init_db():
    """Creates tables from models.py on startup"""
    SQLModel.metadata.create_all(engine)

def get_session():
    """Injected into routes via Depends() to get a DB session per request"""
    with Session(engine) as session:
        yield session