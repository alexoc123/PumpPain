const express = require('express');
const { getLatestPrices, getCheapestNear } = require('../db/database');

const router = express.Router();

// GET /api/prices - all latest prices for the map
router.get('/', (req, res) => {
  try {
    const prices = getLatestPrices(48);
    // Group by station, collect fuel types
    const stationMap = {};
    for (const row of prices) {
      if (!stationMap[row.id]) {
        stationMap[row.id] = {
          id: row.id,
          name: row.name,
          lat: row.lat,
          lng: row.lng,
          address: row.address,
          fuels: {},
        };
      }
      stationMap[row.id].fuels[row.fuel_type] = {
        price: row.price,
        reported_at: row.reported_at,
      };
    }
    res.json(Object.values(stationMap));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/prices/nearby?lat=&lng=&fuel=petrol
router.get('/nearby', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const fuel = req.query.fuel || 'petrol';
  const radius = parseFloat(req.query.radius) || 10;

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  try {
    const results = getCheapestNear(lat, lng, fuel, radius, 10);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
