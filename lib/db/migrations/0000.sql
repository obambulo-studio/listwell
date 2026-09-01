CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  website_url TEXT,
  facebook_url TEXT,
  instagram_username TEXT,
  tiktok_username TEXT,
  x_username TEXT,
  linkedin_url TEXT,
  youtube_url TEXT,
  uber_eats_url TEXT,
  door_dash_url TEXT,
  deliveroo_url TEXT,
  menulog_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  google_place_id TEXT,
  apple_maps_id TEXT,
  name TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
