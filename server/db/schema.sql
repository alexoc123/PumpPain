CREATE TABLE IF NOT EXISTS stations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  address TEXT,
  osm_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS prices (
  id SERIAL PRIMARY KEY,
  station_id INTEGER NOT NULL REFERENCES stations(id),
  fuel_type TEXT NOT NULL CHECK(fuel_type IN ('petrol', 'diesel', 'e85')),
  price DOUBLE PRECISION NOT NULL,
  reported_at TIMESTAMP DEFAULT NOW(),
  image_url TEXT,
  reporter_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_prices_station ON prices(station_id);
CREATE INDEX IF NOT EXISTS idx_prices_reported_at ON prices(reported_at);
