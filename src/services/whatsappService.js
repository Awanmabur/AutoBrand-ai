const env = require('../config/env');
const { decryptToken } = require('./tokenCryptoService');

class WhatsAppProviderError extends Error {
  constructor(message, response) {
    super(message);
    this.name = 'WhatsAppProviderError';
    this.response = response;
  }
}

const graphVersion = env.facebookGraphVersion.startsWith('v') ? env.facebookGraphVersion : `v${env.facebookGraphVersion}`;
const graphBaseUrl = `https://graph.facebook.com/${graphVersion}`;

function accountParts(account) {
  const raw = String(account.accountId || '').trim();
  const [phoneNumberId, accountRecipient] = raw.includes('|') ? raw.split('|').map((item) => item.trim()) : [raw, ''];
  return {
    phoneNumberId: phoneNumberId || env.whatsappPhoneNumberId,
    recipient: accountRecipient || ''
  };
}

function isWhatsAppConfigured() {
  return Boolean(env.whatsappAccessToken && env.whatsappPhoneNumberId);
}

function cleanPhone(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function whatsappRecipient({ post, account }) {
  return cleanPhone(
    post.platformMetadata?.whatsappTo
      || post.platformMetadata?.recipientPhone
      || account.recipientPhone
      || account.whatsappTo
      || accountParts(account).recipient
      || env.whatsappDefaultRecipient
  );
}

function whatsappText(post) {
  return [post.caption, post.hashtags?.length ? post.hashtags.join(' ') : '', post.link || '']
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 4096);
}

function firstPublicMedia(post, type) {
  const media = Array.isArray(post.media) ? post.media : [];
  return media.find((item) => item.fileType === type && /^https?:\/\//i.test(item.fileUrl || '') && !/localhost|127\.0\.0\.1/i.test(item.fileUrl));
}

function messageBody(post, to) {
  const image = firstPublicMedia(post, 'image');
  const video = firstPublicMedia(post, 'video');
  const caption = whatsappText(post);
  if (video) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'video',
      video: { link: video.fileUrl, caption }
    };
  }
  if (image) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: { link: image.fileUrl, caption }
    };
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: Boolean(post.link), body: caption }
  };
}

async function publishWhatsAppMessage({ post, account }) {
  const accessToken = account.accessTokenEncrypted ? decryptToken(account.accessTokenEncrypted) : (account.accessToken || env.whatsappAccessToken || '');
  if (!accessToken) throw new WhatsAppProviderError('WhatsApp access token is missing. Reconnect through Meta.');
  const { phoneNumberId } = accountParts(account);
  if (!phoneNumberId) throw new WhatsAppProviderError('WhatsApp Phone Number ID is missing.');
  const to = whatsappRecipient({ post, account });
  if (!to) {
    throw new WhatsAppProviderError('WhatsApp needs a recipient phone number. Set WHATSAPP_DEFAULT_TO in .env or save the account ID as phone_number_id|recipient_phone.');
  }

  const response = await fetch(`${graphBaseUrl}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(messageBody(post, to))
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new WhatsAppProviderError(data.error?.message || `WhatsApp Cloud API request failed with ${response.status}.`, data);
  }
  const messageId = data.messages?.[0]?.id || `whatsapp_${post._id}`;
  return { id: messageId, raw: data };
}

module.exports = { WhatsAppProviderError, isWhatsAppConfigured, publishWhatsAppMessage };
