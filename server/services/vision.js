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
            text: `You are reading a fuel forecourt price sign or pump display in Ireland.
Extract all visible fuel prices and return ONLY valid JSON in this exact format:
{"prices": [{"fuel_type": "petrol"|"diesel", "price_per_litre": <number in euros>}]}

Important rules:
- Prices in Ireland are always between €1.50 and €2.50 per litre. ALWAYS return price_per_litre as euros (e.g. 1.879, not 187.9)
- If the sign shows a number like 187.9 or 192.8, that is in cents — divide by 100 and return 1.879 or 1.928
- "Unleaded", "Unleaded 95", "Unleaded 98", "Super Unleaded" and "E10" all mean petrol — label them as "petrol"
- Only use "diesel" for diesel fuel
- Do NOT use "e85" — it is not sold in Ireland. If you see something that might be E85, label it as "petrol" instead
- If a sign shows multiple grades of the same fuel type, return only the most common/cheapest one
- If you cannot read any prices clearly, return: {"prices": [], "error": "reason"}
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
