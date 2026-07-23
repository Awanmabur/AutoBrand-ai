const crypto = require('crypto');
const env = require('../config/env');
const Payment = require('../models/Payment');
const WebhookEvent = require('../models/WebhookEvent');

const ALLOWED_PROVIDERS = new Set(['autobrand', 'openai', 'cloudinary', 'meta', 'facebook', 'instagram', 'tiktok', 'youtube', 'linkedin']);
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validSignature(req) {
  if (!env.webhookSecret || !req.rawBody) return false;
  const signatureHeader = String(req.get('x-autobrand-signature') || req.get('x-webhook-signature') || '');
  const signature = signatureHeader.replace(/^sha256=/i, '');
  const timestamp = Number(req.get('x-autobrand-timestamp'));
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS) return false;
  const payload = Buffer.concat([Buffer.from(`${timestamp}.`), req.rawBody]);
  const expected = crypto.createHmac('sha256', env.webhookSecret).update(payload).digest('hex');
  return safeEqual(signature, expected);
}

async function receive(req, res, next) {
  try {
    if (!validSignature(req)) return res.status(401).json({ ok: false, error: 'Invalid or expired webhook signature.' });

    const provider = String(req.params.provider || '').trim().toLowerCase();
    if (!ALLOWED_PROVIDERS.has(provider)) return res.status(404).json({ ok: false, error: 'Unsupported webhook provider.' });

    const eventId = String(req.body.id || req.body.eventId || '').trim().slice(0, 200);
    if (!eventId) return res.status(400).json({ ok: false, error: 'Webhook event ID is required.' });
    const eventType = String(req.body.type || req.body.event || 'unknown').trim().slice(0, 200);

    const event = await WebhookEvent.findOneAndUpdate(
      { provider, eventId },
      {
        $setOnInsert: {
          provider,
          eventId,
          type: eventType,
          payload: req.body,
          status: 'received'
        }
      },
      { upsert: true, new: true, rawResult: false }
    );

    if (event.status === 'processed') return res.json({ ok: true, duplicate: true });

    const reference = String(req.body.reference || req.body.data?.reference || req.body.data?.id || '').trim();
    const paid = ['paid', 'payment_succeeded', 'charge.completed', 'checkout.session.completed'].includes(eventType)
      || String(req.body.status || '').toLowerCase() === 'paid';
    if (reference && paid) {
      await Payment.findOneAndUpdate(
        { reference, provider, status: { $ne: 'paid' } },
        { $set: { status: 'paid', paidAt: new Date() } },
        { new: true }
      );
    }

    event.status = 'processed';
    event.processedAt = new Date();
    await event.save();
    return res.json({ ok: true });
  } catch (error) {
    if (error?.code === 11000) return res.json({ ok: true, duplicate: true });
    return next(error);
  }
}

module.exports = { receive, validSignature };
