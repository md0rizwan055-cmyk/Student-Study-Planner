from typing import Any, Optional
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "studyplanner")
JWT_SECRET = os.getenv("JWT_SECRET", "studyplanner-secret-key-2024")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "7"))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

client: Optional[Any] = None
db: Optional[Any] = None

# ── IN-MEMORY MOCK MONGO WRAPPER ────────────────────────────────────
class MockAsyncCursor:
    def __init__(self, sync_cursor):
        self.sync_cursor = sync_cursor
        
    def sort(self, *args, **kwargs):
        self.sync_cursor.sort(*args, **kwargs)
        return self
        
    def limit(self, count):
        self.sync_cursor.limit(count)
        return self

    def skip(self, count):
        self.sync_cursor.skip(count)
        return self

    async def to_list(self, length=None):
        lst = list(self.sync_cursor)
        if length is not None:
            lst = lst[:length]
        return lst

    def __aiter__(self):
        self._iter = iter(list(self.sync_cursor))
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration

class MockAsyncCollection:
    def __init__(self, sync_collection):
        self.sync_collection = sync_collection
        
    async def find_one(self, *args, **kwargs):
        return self.sync_collection.find_one(*args, **kwargs)
        
    async def insert_one(self, *args, **kwargs):
        return self.sync_collection.insert_one(*args, **kwargs)

    async def insert_many(self, *args, **kwargs):
        return self.sync_collection.insert_many(*args, **kwargs)
        
    async def update_one(self, *args, **kwargs):
        return self.sync_collection.update_one(*args, **kwargs)
        
    async def update_many(self, *args, **kwargs):
        return self.sync_collection.update_many(*args, **kwargs)
        
    async def delete_one(self, *args, **kwargs):
        return self.sync_collection.delete_one(*args, **kwargs)
        
    async def delete_many(self, *args, **kwargs):
        return self.sync_collection.delete_many(*args, **kwargs)
        
    async def replace_one(self, *args, **kwargs):
        return self.sync_collection.replace_one(*args, **kwargs)

    async def count_documents(self, *args, **kwargs):
        return self.sync_collection.count_documents(*args, **kwargs)
        
    def find(self, *args, **kwargs):
        sync_cursor = self.sync_collection.find(*args, **kwargs)
        return MockAsyncCursor(sync_cursor)
        
    async def create_index(self, *args, **kwargs):
        return None

    async def drop(self, *args, **kwargs):
        return self.sync_collection.drop(*args, **kwargs)

class MockAsyncDatabase:
    def __init__(self, sync_db):
        self.sync_db = sync_db
        self.collections = {}
        
    def __getattr__(self, name):
        if name not in self.collections:
            self.collections[name] = MockAsyncCollection(self.sync_db[name])
        return self.collections[name]
        
    def __getitem__(self, name):
        return self.__getattr__(name)

_shared_mock_sync_client = None

def get_shared_mock_client():
    global _shared_mock_sync_client
    if _shared_mock_sync_client is None:
        import mongomock
        _shared_mock_sync_client = mongomock.MongoClient()
    return _shared_mock_sync_client

class MockAsyncClient:
    def __init__(self):
        self.sync_client = get_shared_mock_client()
        
    def __getitem__(self, name):
        return MockAsyncDatabase(self.sync_client[name])
        
    def close(self):
        pass

# ── DATABASE CONNECTION ─────────────────────────────────────────────
async def connect_db():
    global client, db
    try:
        # Try real MongoDB with a fast 1.5s timeout so it doesn't block startup
        client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=1500)
        db = client[DATABASE_NAME]
        await db.users.create_index("email", unique=True)
        await db.sessions.create_index([("user_id", 1), ("date", 1)])
        await db.topics.create_index([("user_id", 1), ("subject_id", 1)])
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        print(f"[OK] Connected to MongoDB: {DATABASE_NAME}")
    except Exception as e:
        print(f"[WARNING] MongoDB connection failed: {e}")
        print("[INFO] Switching to in-memory Mock MongoDB database fallback.")
        client = MockAsyncClient()
        db = client[DATABASE_NAME]


async def close_db():
    global client
    if client:
        client.close()
        print("MongoDB connection closed.")


def get_db() -> Any:
    global client, db
    if db is None:
        client = MockAsyncClient()
        db = client[DATABASE_NAME]
    return db
