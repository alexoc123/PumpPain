const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Database schema ready');
}

async function upsertStation({ name, lat, lng, address, osm_id }) {
  const result = await pool.query(
    `INSERT INTO stations (name, lat, lng, address, osm_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (osm_id) DO UPDATE SET
       name = CASE WHEN EXCLUDED.address IS NOT NULL AND EXCLUDED.address != '' THEN EXCLUDED.name ELSE stations.name END,
       address = COALESCE(NULLIF(EXCLUDED.address, ''), stations.address)
     RETURNING id`,
    [name, lat, lng, address, osm_id]
  );
  return result.rows[0].id;
}

async function insertPrice({ station_id, fuel_type, price, image_url, reporter_hash }) {
  const result = await pool.query(
    `INSERT INTO prices (station_id, fuel_type, price, image_url, reporter_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [station_id, fuel_type, price, image_url, reporter_hash]
  );
  return result.rows[0].id;
}

async function getLatestPrices() {
  const result = await pool.query(
    `SELECT DISTINCT ON (s.id, p.fuel_type)
       s.id, s.name, s.lat, s.lng, s.address,
       p.fuel_type, p.price, p.reported_at
     FROM prices p
     JOIN stations s ON s.id = p.station_id
     ORDER BY s.id, p.fuel_type, p.reported_at DESC`
  );
  return result.rows;
}

async function getCheapestNear(lat, lng, fuelType, radiusKm = 10, limit = 5) {
  const latDelta = radiusKm / 111.0;
  const lngDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));

  const result = await pool.query(
    `SELECT DISTINCT ON (s.id)
       s.id, s.name, s.lat, s.lng, s.address,
       p.fuel_type, p.price, p.reported_at,
       (6371 * acos(
         cos(radians($1)) * cos(radians(s.lat)) *
         cos(radians(s.lng) - radians($2)) +
         sin(radians($1)) * sin(radians(s.lat))
       )) AS distance_km
     FROM prices p
     JOIN stations s ON s.id = p.station_id
     WHERE p.fuel_type = $3
       AND p.reported_at >= NOW() - INTERVAL '48 hours'
       AND s.lat BETWEEN $4 AND $5
       AND s.lng BETWEEN $6 AND $7
     ORDER BY s.id, p.reported_at DESC`,
    [lat, lng, fuelType, lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta]
  );

  return result.rows
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

async function getTotalPriceCount() {
  const result = await pool.query('SELECT COUNT(*) as count FROM prices');
  return parseInt(result.rows[0].count, 10);
}

module.exports = { initDb, upsertStation, insertPrice, getLatestPrices, getCheapestNear, getTotalPriceCount };
