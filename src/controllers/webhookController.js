const crypto = require('crypto');
const env = require('../config/env');
const Payment = require('../models/Payment');
const WebhookEvent = require('../models/WebhookEvent');

function validSignature(req) {
  if (!env.webhookSecret) return false;
  const signature = req.get('x-autobrand-signature') || req.get('x-webhook-signature');
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', env.webhookSecret).update(JSON.stringify(req.body || {})).digest('hex');
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

async function receive(req, res, next) {
  try {
    if (!validSignature(req)) return res.status(401).json({ ok: false, error: 'Invalid webhook signature.' });

    const provider = req.params.provider;
    const eventId = req.body.id || req.body.eventId || `${provider}_${Date.now()}`;
    const eventType = req.body.type || req.body.event || 'unknown';

    const event = await WebhookEvent.create({
      provider,
      eventId,
      type: eventType,
      payload: req.body,
      status: 'received'
    });

    const reference = req.body.reference || req.body.data?.reference || req.body.data?.id;
    const paid = ['paid', 'payment_succeeded', 'charge.completed', 'checkout.session.completed'].includes(eventType) || req.body.status === 'paid';
    if (reference && paid) {
      await Payment.findOneAndUpdate({ reference }, { status: 'paid', provider }, { new: true });
      event.status = 'processed';
      event.processedAt = new Date();
      await event.save();
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = { receive };
