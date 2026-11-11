from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from task1.app.config import settings

# Database engine
# connect_args check_same_thread is only needed if sqlite is used in local unit tests
engine_kwargs = {}
if settings.DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

# SessionLocal is the factory for new DB sessions per request
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all SQLAlchemy database models
Base = declarative_base()

def get_db():
    """
    FastAPI dependency that yields a database session per request 
    and guarantees it is closed cleanly when the request finishes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

