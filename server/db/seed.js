/**
 * Seed script — inserts a handful of demo stations and prices so the map
 * isn't empty on first run. Run once: node db/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getDb, upsertStation, insertPrice } = require('./database');

const STATIONS = [
  { name: 'Circle K Dublin City', lat: 53.3378, lng: -6.2597, address: 'Pearse Street, Dublin 2', osm_id: 'demo/1' },
  { name: 'Applegreen Naas Road', lat: 53.3027, lng: -6.3760, address: 'Naas Road, Dublin 12', osm_id: 'demo/2' },
  { name: 'Topaz Galway', lat: 53.2700, lng: -9.0700, address: 'Headford Road, Galway', osm_id: 'demo/3' },
  { name: 'Circle K Cork', lat: 51.8969, lng: -8.4863, address: 'MacCurtain Street, Cork', osm_id: 'demo/4' },
  { name: 'Maxol Limerick', lat: 52.6638, lng: -8.6267, address: 'O\'Connell Street, Limerick', osm_id: 'demo/5' },
  { name: 'Applegreen Waterford', lat: 52.2580, lng: -7.1100, address: 'The Quay, Waterford', osm_id: 'demo/6' },
  { name: 'Tesco Fuel Dublin North', lat: 53.3990, lng: -6.2180, address: 'Drumcondra Road, Dublin 9', osm_id: 'demo/7' },
];

const PRICES = [
  { petrol: 1.759, diesel: 1.729 },
  { petrol: 1.789, diesel: 1.749 },
  { petrol: 1.819, diesel: 1.779 },
  { petrol: 1.849, diesel: 1.809 },
  { petrol: 1.769, diesel: 1.739 },
  { petrol: 1.799, diesel: 1.769 },
  { petrol: 1.739, diesel: 1.719 },
];

(function seed() {
  getDb(); // initialise schema
  for (let i = 0; i < STATIONS.length; i++) {
    const station_id = upsertStation(STATIONS[i]);
    insertPrice({ station_id, fuel_type: 'petrol', price: PRICES[i].petrol, image_url: null, reporter_hash: 'seed' });
    insertPrice({ station_id, fuel_type: 'diesel', price: PRICES[i].diesel, image_url: null, reporter_hash: 'seed' });
    console.log(`Seeded: ${STATIONS[i].name}`);
  }
  console.log('Seed complete.');
})();
