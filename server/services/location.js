const axios = require('axios');
const { upsertStation } = require('../db/database');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

async function findNearestStation(lat, lng, radiusMeters = 500) {
  const query = `
    [out:json][timeout:10];
    (
      node["amenity"="fuel"](around:${radiusMeters},${lat},${lng});
      way["amenity"="fuel"](around:${radiusMeters},${lat},${lng});
      node["amenity"="service_station"](around:${radiusMeters},${lat},${lng});
      way["amenity"="service_station"](around:${radiusMeters},${lat},${lng});
      node["brand"~"Amber|Applegreen|Beechgrove|Burgess|Burmah|Campus|Campus Oil|Carta|Centra|Certa|Certa Fuel|Circle K|Circle K Express|Clarke's|Corrib Oil|Cunniffes|Daly's|Day-Today|Discount Fuels|Donegal Oil|Drive|Elite Oil|Emo|Esso|Esso Express|Estuary|Estuary Fuel|Excol|Glen Fuels|Go|GreatGas|GreatGas Express|Gulf|Independent|Inniskeen Fuels|Inver|LPGain|Mace|Maxoil|Maxol|Morris Oil|Naas Oil|Oil4U|Opt Fuel|O'Sullivan|Pure|Q. Oil|Quigley's|Sheehan's|Shell|Silverstream|Spar|Statoil|Sweeney Oil|Swift|Swift Oil|Tara|Tara Oil|Tesco|Texaco|Tommy Martin Fuels|Top|Topaz|Tria|Xpress Stop",i](around:${radiusMeters},${lat},${lng});
      way["brand"~"Amber|Applegreen|Beechgrove|Burgess|Burmah|Campus|Campus Oil|Carta|Centra|Certa|Certa Fuel|Circle K|Circle K Express|Clarke's|Corrib Oil|Cunniffes|Daly's|Day-Today|Discount Fuels|Donegal Oil|Drive|Elite Oil|Emo|Esso|Esso Express|Estuary|Estuary Fuel|Excol|Glen Fuels|Go|GreatGas|GreatGas Express|Gulf|Independent|Inniskeen Fuels|Inver|LPGain|Mace|Maxoil|Maxol|Morris Oil|Naas Oil|Oil4U|Opt Fuel|O'Sullivan|Pure|Q. Oil|Quigley's|Sheehan's|Shell|Silverstream|Spar|Statoil|Sweeney Oil|Swift|Swift Oil|Tara|Tara Oil|Tesco|Texaco|Tommy Martin Fuels|Top|Topaz|Tria|Xpress Stop",i](around:${radiusMeters},${lat},${lng});
    );
    out center;
  `;

  let elements;
  try {
    const params = new URLSearchParams({ data: query });
    const response = await axios.post(OVERPASS_URL, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'PumpPain/1.0 (pumppain.ie)',
      },
      timeout: 15000,
    });
    elements = response.data?.elements || [];
    console.log(`[overpass] Searched ${lat},${lng} radius ${radiusMeters}m — found ${elements.length} elements`);
  } catch (err) {
    throw new Error(`Overpass API failed: ${err.message}`);
  }

  if (elements.length === 0) {
    console.log(`[overpass] No stations found near ${lat},${lng}`);
    return null;
  }

  // Pick closest element
  const closest = elements
    .map((el) => {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (!elLat || !elLng) return null;
      const dist = haversine(lat, lng, elLat, elLng);
      return { ...el, elLat, elLng, dist };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist)[0];

  if (!closest) return null;

  const tags = closest.tags || {};
  const brandName = tags.name || tags.brand || tags.operator || 'Fuel Station';
  const address = [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ');
  const name = address ? `${brandName} — ${address}` : brandName;
  const osm_id = `${closest.type}/${closest.id}`;

  const station_id = upsertStation({
    name,
    lat: closest.elLat,
    lng: closest.elLng,
    address,
    osm_id,
  });

  return { station_id, name, lat: closest.elLat, lng: closest.elLng, address };
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { findNearestStation };
