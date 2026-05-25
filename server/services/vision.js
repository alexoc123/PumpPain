const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extractPricesFromImage(imageUrl, useTwilioAuth = false) {
  let imageBase64, mediaType;
  try {
    const auth = useTwilioAuth
      ? { username: process.env.TWILIO_ACCOUNT_SID, password: process.env.TWILIO_AUTH_TOKEN }
      : undefined;
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', auth });
    imageBase64 = Buffer.from(response.data).toString('base64');
    mediaType = response.headers['content-type']?.split(';')[0] || 'image/jpeg';
  } catch (err) {
    throw new Error(`Failed to download image: ${err.message}`);
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text: `You are reading a fuel forecourt price sign or pump display.
Extract all visible fuel prices and return ONLY valid JSON in this exact format:
{"prices": [{"fuel_type": "petrol"|"diesel"|"e85", "price_per_litre": <number in euros>}]}
If you cannot read any prices clearly, return: {"prices": [], "error": "reason"}
Do not include any other text.`,
          },
        ],
      },
    ],
  });

  const text = message.content[0]?.text?.trim().replace(/^```json\s*/i, '').replace(/```$/,'');
  console.log('[claude] Raw response:', text);

  try {
    const parsed = JSON.parse(text);
    console.log('[claude] Parsed prices:', parsed.prices);
    return parsed.prices || [];
  } catch {
    console.log('[claude] Failed to parse response');
    return [];
  }
}

module.exports = { extractPricesFromImage };
