PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  coin REAL DEFAULT 0,
  ton REAL DEFAULT 0,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  energy INTEGER DEFAULT 100,
  last_coco INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  item_type TEXT,
  item_subtype TEXT,
  quantity INTEGER DEFAULT 1,
  meta TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS market_listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT,
  item_id TEXT,
  item_type TEXT,
  item_subtype TEXT,
  price REAL,
  created_at INTEGER,
  FOREIGN KEY(seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS game_params (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT,
  amount REAL,
  created_at INTEGER,
  meta TEXT
);
