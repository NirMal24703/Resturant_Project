"""SQLite engine + the per-request session dependency."""

from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = "sqlite:///./quickdine.db"

# check_same_thread=False because FastAPI serves requests from a threadpool.
engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    """Create any missing tables from models.py. Called once on startup."""
    # Importing models registers them on SQLModel.metadata before create_all.
    import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session():
    """Injected into routes with Depends(get_session)."""
    with Session(engine) as session:
        yield session
