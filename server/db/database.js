const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'pumppain.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
  }
  return db;
}

function upsertStation({ name, lat, lng, address, osm_id }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM stations WHERE osm_id = ?').get(osm_id);
  if (existing) return existing.id;
  const result = db.prepare(
    'INSERT INTO stations (name, lat, lng, address, osm_id) VALUES (?, ?, ?, ?, ?)'
  ).run(name, lat, lng, address, osm_id);
  return result.lastInsertRowid;
}

function insertPrice({ station_id, fuel_type, price, image_url, reporter_hash }) {
  const db = getDb();
  return db.prepare(
    'INSERT INTO prices (station_id, fuel_type, price, image_url, reporter_hash) VALUES (?, ?, ?, ?, ?)'
  ).run(station_id, fuel_type, price, image_url, reporter_hash).lastInsertRowid;
}

function getLatestPrices(limitHours = 48) {
  const db = getDb();
  return db.prepare(`
    SELECT
      s.id, s.name, s.lat, s.lng, s.address,
      p.fuel_type, p.price, p.reported_at
    FROM prices p
    JOIN stations s ON s.id = p.station_id
    WHERE p.reported_at >= datetime('now', '-' || ? || ' hours')
      AND p.id = (
        SELECT id FROM prices p2
        WHERE p2.station_id = p.station_id AND p2.fuel_type = p.fuel_type
        ORDER BY reported_at DESC LIMIT 1
      )
    ORDER BY p.price ASC
  `).all(limitHours);
}

function getCheapestNear(lat, lng, fuelType, radiusKm = 10, limit = 5) {
  const db = getDb();
  // Haversine approx via bounding box then sort by distance
  const latDelta = radiusKm / 111.0;
  const lngDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));

  return db.prepare(`
    SELECT
      s.id, s.name, s.lat, s.lng, s.address,
      p.fuel_type, p.price, p.reported_at,
      (6371 * acos(
        cos(radians(?)) * cos(radians(s.lat)) *
        cos(radians(s.lng) - radians(?)) +
        sin(radians(?)) * sin(radians(s.lat))
      )) AS distance_km
    FROM prices p
    JOIN stations s ON s.id = p.station_id
    WHERE p.fuel_type = ?
      AND p.reported_at >= datetime('now', '-48 hours')
      AND s.lat BETWEEN ? AND ?
      AND s.lng BETWEEN ? AND ?
      AND p.id = (
        SELECT id FROM prices p2
        WHERE p2.station_id = p.station_id AND p2.fuel_type = p.fuel_type
        ORDER BY reported_at DESC LIMIT 1
      )
    ORDER BY p.price ASC
    LIMIT ?
  `).all(lat, lng, lat, fuelType, lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta, limit);
}

function getTotalPriceCount() {
  return getDb().prepare('SELECT COUNT(*) as count FROM prices').get().count;
}

module.exports = { getDb, upsertStation, insertPrice, getLatestPrices, getCheapestNear, getTotalPriceCount };
