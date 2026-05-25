CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  address TEXT,
  osm_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id INTEGER NOT NULL,
  fuel_type TEXT NOT NULL CHECK(fuel_type IN ('petrol', 'diesel', 'e85')),
  price REAL NOT NULL,
  reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  image_url TEXT,
  reporter_hash TEXT,
  FOREIGN KEY (station_id) REFERENCES stations(id)
);

CREATE INDEX IF NOT EXISTS idx_prices_station ON prices(station_id);
CREATE INDEX IF NOT EXISTS idx_prices_reported_at ON prices(reported_at);
