const express = require('express');
const twilio = require('twilio');
const crypto = require('crypto');
const { extractPricesFromImage } = require('../services/vision');
const { findNearestStation } = require('../services/location');
const { insertPrice, getCheapestNear, getTotalPriceCount } = require('../db/database');

const MIN_ENTRIES_FOR_RECOMMENDATIONS = 20;

// Pending photos waiting for a location to arrive from the same user.
// Structure: phoneNumber -> { imageUrl, reporterHash, expiresAt }
const pendingPhotos = new Map();
const PHOTO_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function storePendingPhoto(from, imageUrl, reporterHash) {
  // Clear any expired entries while we're here
  const now = Date.now();
  for (const [key, val] of pendingPhotos) {
    if (val.expiresAt < now) pendingPhotos.delete(key);
  }
  pendingPhotos.set(from, { imageUrl, reporterHash, expiresAt: now + PHOTO_EXPIRY_MS });
}

function claimPendingPhoto(from) {
  const entry = pendingPhotos.get(from);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    pendingPhotos.delete(from);
    return null;
  }
  pendingPhotos.delete(from);
  return entry;
}

const router = express.Router();

function buildTwiMLResponse(body) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${body}</Message></Response>`;
}

function hashPhone(number) {
  return crypto.createHash('sha256').update(number + (process.env.PHONE_SALT || 'pp')).digest('hex').slice(0, 16);
}

async function processPhotoAndLocation(imageUrl, reporterHash, latitude, longitude, res) {
  console.log(`[vision] Processing image: ${imageUrl}`);
  const prices = await extractPricesFromImage(imageUrl, true);
  console.log(`[vision] Extracted prices:`, prices);

  if (prices.length === 0) {
    console.log('[vision] No prices extracted — aborting save');
    return res.send(buildTwiMLResponse(
      "😕 I couldn't read any prices from that image. Please make sure the price display is clear and well-lit, then try again."
    ));
  }

  console.log(`[location] Searching for station near ${latitude}, ${longitude}`);
  const station = await findNearestStation(latitude, longitude);
  console.log(`[location] Found station:`, station);

  if (!station) {
    console.log('[location] No station found within radius');
    return res.send(buildTwiMLResponse(
      "📍 I couldn't find a petrol station near those coordinates. Are you sure you're at a fuel station?"
    ));
  }

  // Normalize cents→euros, then keep only the cheapest entry per fuel type
  const cheapestByFuel = {};
  for (const { fuel_type, price_per_litre } of prices) {
    const normalized = price_per_litre > 5 && price_per_litre < 500 ? price_per_litre / 100 : price_per_litre;
    if (!cheapestByFuel[fuel_type] || normalized < cheapestByFuel[fuel_type]) {
      cheapestByFuel[fuel_type] = normalized;
    }
  }
  const normalizedPrices = Object.entries(cheapestByFuel).map(([fuel_type, price_per_litre]) => ({ fuel_type, price_per_litre }));

  for (const { fuel_type, price_per_litre } of normalizedPrices) {
    if (price_per_litre >= 1.40 && price_per_litre <= 2.50) {
      await insertPrice({
        station_id: station.station_id,
        fuel_type,
        price: price_per_litre,
        image_url: imageUrl,
        reporter_hash: reporterHash,
      });
    }
  }

  const summary = normalizedPrices
    .map((p) => `${p.fuel_type}: €${p.price_per_litre.toFixed(3)}/L`)
    .join(', ');

  let msg = `✅ Thanks for sending us a picture! We've recorded ${summary} at *${station.name}*.\n\n`;

  if (await getTotalPriceCount() < MIN_ENTRIES_FOR_RECOMMENDATIONS) {
    msg += "We don't have enough data to tell you where the cheapest fuel near you is just yet, but we will soon in the future. Keep the pictures coming!";
  } else {
    const nearby = await getCheapestNear(latitude, longitude, prices[0].fuel_type, 10, 3);
    if (nearby.length > 0) {
      msg += `⛽ *Cheapest ${prices[0].fuel_type} nearby:*\n`;
      nearby.slice(0, 3).forEach((r, i) => {
        msg += `${i + 1}. ${r.name} — €${r.price.toFixed(3)}/L\n`;
      });
    }
    msg += '\nSee the full map at pumppain.ie';
  }

  return res.send(buildTwiMLResponse(msg));
}

router.post('/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    const valid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      req.headers['x-twilio-signature'],
      `${process.env.BASE_URL}/api/whatsapp/webhook`,
      req.body
    );
    if (!valid) return res.status(403).send('Forbidden');
  }

  res.set('Content-Type', 'text/xml');

  const from = req.body.From || '';
  const numMedia = parseInt(req.body.NumMedia || '0', 10);
  const latitude = parseFloat(req.body.Latitude);
  const longitude = parseFloat(req.body.Longitude);
  const hasPhoto = numMedia > 0;
  const hasLocation = !isNaN(latitude) && !isNaN(longitude);

  // --- Photo + location together (ideal flow) ---
  if (hasPhoto && hasLocation) {
    try {
      const imageUrl = req.body['MediaUrl0'];
      const reporterHash = hashPhone(from);
      return await processPhotoAndLocation(imageUrl, reporterHash, latitude, longitude, res);
    } catch (err) {
      console.error('Webhook processing error:', err);
      return res.send(buildTwiMLResponse('Sorry, something went wrong processing your image. Please try again.'));
    }
  }

  // --- Photo without location: save it and ask for location ---
  if (hasPhoto && !hasLocation) {
    const imageUrl = req.body['MediaUrl0'];
    const reporterHash = hashPhone(from);
    storePendingPhoto(from, imageUrl, reporterHash);
    return res.send(buildTwiMLResponse(
      '📍 Got your photo! Now please share your *location* so we can link the price to the correct petrol station.\n\n' +
      'In WhatsApp: tap the *+* icon → *Location* → *Send Your Current Location*.\n\n' +
      'You have 10 minutes to send it.'
    ));
  }

  // --- Location without photo: check if there's a pending photo waiting ---
  if (!hasPhoto && hasLocation) {
    const pending = claimPendingPhoto(from);

    if (pending) {
      // Location arrived for a previously sent photo — process them together
      try {
        return await processPhotoAndLocation(pending.imageUrl, pending.reporterHash, latitude, longitude, res);
      } catch (err) {
        console.error('Webhook processing error:', err);
        return res.send(buildTwiMLResponse('Sorry, something went wrong processing your image. Please try again.'));
      }
    }

    // No pending photo — user is asking for nearby prices
    try {
      if (await getTotalPriceCount() < MIN_ENTRIES_FOR_RECOMMENDATIONS) {
        return res.send(buildTwiMLResponse(
          "Thank you for getting in touch! We don't have enough data to tell you where the cheapest fuel near you is just yet, but we will soon. " +
          'Help us get there faster by sending a photo of a pump price display!'
        ));
      }

      const petrol = await getCheapestNear(latitude, longitude, 'petrol', 10, 3);
      const diesel = await getCheapestNear(latitude, longitude, 'diesel', 10, 3);

      if (petrol.length === 0 && diesel.length === 0) {
        return res.send(buildTwiMLResponse(
          'No fuel prices reported near you in the last 48 hours. Be the first! Send a photo of a pump price display.'
        ));
      }

      let msg = '⛽ *Cheapest fuel near you:*\n\n';
      if (petrol.length > 0) {
        msg += '*Petrol:*\n';
        petrol.forEach((r, i) => {
          msg += `${i + 1}. ${r.name} — €${r.price.toFixed(3)}/L (${r.distance_km?.toFixed(1)}km)\n`;
        });
        msg += '\n';
      }
      if (diesel.length > 0) {
        msg += '*Diesel:*\n';
        diesel.forEach((r, i) => {
          msg += `${i + 1}. ${r.name} — €${r.price.toFixed(3)}/L (${r.distance_km?.toFixed(1)}km)\n`;
        });
      }
      msg += '\nPrices updated by community. Visit pumppain.ie for the full map.';
      return res.send(buildTwiMLResponse(msg));
    } catch (err) {
      console.error('Price lookup error:', err);
      return res.send(buildTwiMLResponse('Sorry, something went wrong. Try again shortly.'));
    }
  }

  // --- Text only: welcome message ---
  return res.send(buildTwiMLResponse(
    '👋 Welcome to PumpPain!\n\n' +
    '📸 *To report a price:* Send a photo of the pump display.\n' +
    '📍 *To find cheap fuel:* Share your location (tap + → Location).\n\n' +
    'Visit pumppain.ie to see the full price map.'
  ));
});

module.exports = router;
