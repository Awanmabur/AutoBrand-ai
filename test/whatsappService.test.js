const test = require('node:test');
const assert = require('node:assert/strict');

const env = require('../src/config/env');
const { publishWhatsAppMessage } = require('../src/services/whatsappService');
const { encryptToken } = require('../src/services/tokenCryptoService');

test('publishWhatsAppMessage sends a text message through Cloud API', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return Response.json({ messages: [{ id: 'wamid.1' }] });
  };

  try {
    const result = await publishWhatsAppMessage({
      post: {
        _id: 'post_wa_text',
        caption: 'Hello WhatsApp',
        hashtags: ['#Offer'],
        link: 'https://example.test'
      },
      account: {
        accountId: 'phone_1|+256700000000',
        accessTokenEncrypted: encryptToken('wa_token')
      }
    });

    assert.equal(result.id, 'wamid.1');
    assert.match(calls[0].url, /\/phone_1\/messages$/);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer wa_token');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.messaging_product, 'whatsapp');
    assert.equal(body.to, '256700000000');
    assert.equal(body.type, 'text');
    assert.match(body.text.body, /Hello WhatsApp/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('publishWhatsAppMessage can use WHATSAPP_DEFAULT_TO for recipient', async () => {
  const originalFetch = global.fetch;
  const originalRecipient = env.whatsappDefaultRecipient;
  env.whatsappDefaultRecipient = '+256711111111';

  global.fetch = async () => Response.json({ messages: [{ id: 'wamid.default' }] });

  try {
    const result = await publishWhatsAppMessage({
      post: { _id: 'post_wa_default', caption: 'Default recipient' },
      account: {
        accountId: 'phone_1',
        accessTokenEncrypted: encryptToken('wa_token')
      }
    });
    assert.equal(result.id, 'wamid.default');
  } finally {
    global.fetch = originalFetch;
    env.whatsappDefaultRecipient = originalRecipient;
  }
});

test('publishWhatsAppMessage can use WhatsApp Cloud API credentials from env', async () => {
  const originalFetch = global.fetch;
  const originalToken = env.whatsappAccessToken;
  const originalPhone = env.whatsappPhoneNumberId;
  const originalRecipient = env.whatsappDefaultRecipient;
  const calls = [];

  env.whatsappAccessToken = 'env_wa_token';
  env.whatsappPhoneNumberId = 'env_phone_1';
  env.whatsappDefaultRecipient = '+256722222222';
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return Response.json({ messages: [{ id: 'wamid.env' }] });
  };

  try {
    const result = await publishWhatsAppMessage({
      post: { _id: 'post_wa_env', caption: 'Env credentials' },
      account: {}
    });

    assert.equal(result.id, 'wamid.env');
    assert.match(calls[0].url, /\/env_phone_1\/messages$/);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer env_wa_token');
  } finally {
    global.fetch = originalFetch;
    env.whatsappAccessToken = originalToken;
    env.whatsappPhoneNumberId = originalPhone;
    env.whatsappDefaultRecipient = originalRecipient;
  }
});
