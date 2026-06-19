const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Brand = require('../src/models/Brand');
const Post = require('../src/models/Post');
const Media = require('../src/models/Media');
const AiVideoJob = require('../src/models/AiVideoJob');
const Campaign = require('../src/models/Campaign');
const VideoRender = require('../src/models/VideoRender');
const SocialAccount = require('../src/models/SocialAccount');
const TeamMember = require('../src/models/TeamMember');
const Approval = require('../src/models/Approval');
const AvatarProfile = require('../src/models/AvatarProfile');
const AvatarConsent = require('../src/models/AvatarConsent');
const Subscription = require('../src/models/Subscription');
const GrowthAsset = require('../src/models/GrowthAsset');
const Payment = require('../src/models/Payment');
const WebhookEvent = require('../src/models/WebhookEvent');
const CreditLedger = require('../src/models/CreditLedger');
const UsageLog = require('../src/models/UsageLog');
const ApiLog = require('../src/models/ApiLog');
const Notification = require('../src/models/Notification');
const RefreshToken = require('../src/models/RefreshToken');

function csrfFrom(html) {
  const match = String(html).match(/name="_csrf" value="([^"]+)"/);
  if (!match) throw new Error('Missing CSRF token');
  return match[1];
}

function optionValueFrom(html) {
  const match = String(html).match(/<option value="([^"]+)"/);
  if (!match) throw new Error('Missing option value');
  return match[1];
}

function optionValueForSelect(html, name) {
  const match = String(html).match(new RegExp(`<select name="${name}"[\\s\\S]*?<option value="([^"]+)"`));
  if (!match) throw new Error(`Missing option value for ${name}`);
  return match[1];
}

function postIdFrom(html) {
  const match = String(html).match(/\/dashboard\/actions\/posts\/([a-f0-9]{24})\/edit/);
  if (!match) throw new Error('Missing post edit link');
  return match[1];
}

function hrefTokenFrom(html, path) {
  const match = String(html).match(new RegExp(`${path}\\?token=([a-f0-9]+)`));
  if (!match) throw new Error(`Missing token link for ${path}`);
  return match[1];
}

function makeClient(baseUrl) {
  const jar = new Map();

  function cookieHeader() {
    return Array.from(jar.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  function storeCookies(response) {
    const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    cookies.forEach((cookie) => {
      const [pair] = cookie.split(';');
      const [key, value] = pair.split('=');
      jar.set(key, value);
    });
  }

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: 'manual',
      ...options,
      headers: {
        Cookie: cookieHeader(),
        ...(options.headers || {})
      }
    });
    storeCookies(response);
    const text = await response.text();
    return { response, text };
  }

  async function follow(path, options = {}) {
    let nextPath = path;
    let nextOptions = options;
    for (let index = 0; index < 5; index += 1) {
      const result = await request(nextPath, nextOptions);
      if (![301, 302, 303, 307, 308].includes(result.response.status)) return result;
      const location = result.response.headers.get('location');
      if (!location) return result;
      const url = new URL(location, baseUrl);
      if (url.origin !== baseUrl) return result;
      nextPath = `${url.pathname}${url.search}`;
      nextOptions = {};
    }
    throw new Error(`Too many redirects for ${path}`);
  }

  async function form(path, fields) {
    const body = new URLSearchParams(fields);
    return request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
  }

  return { request, form, follow };
}

async function cleanup(email) {
  const users = await User.find({ email }).select('_id');
  const ids = users.map((user) => user._id);
  await Promise.all([
    Post.deleteMany({ createdBy: { $in: ids } }),
    Media.deleteMany({ uploadedBy: { $in: ids } }),
    AiVideoJob.deleteMany({ createdBy: { $in: ids } }),
    Campaign.deleteMany({ createdBy: { $in: ids } }),
    VideoRender.deleteMany({ createdBy: { $in: ids } }),
    SocialAccount.deleteMany({ owner: { $in: ids } }),
    TeamMember.deleteMany({ invitedBy: { $in: ids } }),
    Approval.deleteMany({ requestedBy: { $in: ids } }),
    AvatarConsent.deleteMany({ user: { $in: ids } }),
    AvatarProfile.deleteMany({ owner: { $in: ids } }),
    Subscription.deleteMany({ user: { $in: ids } }),
    GrowthAsset.deleteMany({ owner: { $in: ids } }),
    Payment.deleteMany({ user: { $in: ids } }),
    CreditLedger.deleteMany({ user: { $in: ids } }),
    UsageLog.deleteMany({ user: { $in: ids } }),
    ApiLog.deleteMany({ user: { $in: ids } }),
    Notification.deleteMany({ user: { $in: ids } }),
    RefreshToken.deleteMany({ user: { $in: ids } }),
    Brand.deleteMany({ owner: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } })
  ]);
}

async function run() {
  await mongoose.connect(env.mongoUri);
  const server = app.listen(0);
  const port = server.address().port;
  const client = makeClient(`http://127.0.0.1:${port}`);
  const stamp = Date.now();
  const email = `feature${stamp}@example.com`;

  try {
    const googleMissing = await client.request('/auth/google');
    if (![302, 503].includes(googleMissing.response.status)) throw new Error(`Google start failed ${googleMissing.response.status}`);

    let page = await client.request('/auth/register');
    let csrf = csrfFrom(page.text);
    let result = await client.form('/auth/register', {
      _csrf: csrf,
      name: 'Feature Smoke',
      email,
      password: 'password123'
    });
    if (result.response.status !== 200) throw new Error(`Register failed ${result.response.status}`);

    const verifyToken = hrefTokenFrom(result.text, '/auth/verify-email');
    result = await client.request(`/auth/verify-email?token=${verifyToken}`);
    if (![302, 303].includes(result.response.status)) throw new Error(`Verify failed ${result.response.status}`);

    page = await client.request('/auth/login');
    csrf = csrfFrom(page.text);
    result = await client.form('/auth/login', {
      _csrf: csrf,
      email,
      password: 'password123'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Login failed ${result.response.status}`);

    await User.updateOne({ email }, { plan: 'pro' });

    result = await client.form('/auth/refresh', {
      _csrf: csrf
    });
    if (result.response.status !== 200) throw new Error(`Refresh failed ${result.response.status}`);

    page = await client.follow('/dashboard/brand-brain');
    csrf = csrfFrom(page.text);
    const brandName = `Feature Brand ${stamp}`;
    result = await client.form('/dashboard/actions/brands', {
      _csrf: csrf,
      name: brandName,
      businessType: 'Internet vouchers',
      description: 'Affordable local internet',
      location: 'Kampala',
      targetAudience: 'Students and shops',
      tone: 'clean and friendly',
      preferredCta: 'Buy voucher now',
      products: 'Daily voucher | UGX 1000 | Fast local internet',
      offers: 'Weekend bundle | Extra data for students',
      socialLinks: 'facebook | https://facebook.com/example',
      postingFrequency: '2 posts per day',
      customerPainPoints: 'Slow internet\nExpensive bundles',
      commonObjections: 'Is it reliable?',
      testimonials: 'Amina | Fast and affordable',
      brandRules: 'Keep it simple'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Brand create failed ${result.response.status}`);

    const smokeUser = await User.findOne({ email });
    const createdBrand = await Brand.findOne({ owner: smokeUser._id, name: brandName });
    if (!createdBrand) throw new Error('Created brand was not saved');
    const brandId = createdBrand._id.toString();

    page = await client.follow('/dashboard/quick-create');
    csrf = csrfFrom(page.text);
    result = await client.form('/dashboard/actions/ai/generate-post', {
      _csrf: csrf,
      brand: brandId,
      platform: 'facebook',
      contentType: 'promo',
      goal: 'Sell weekend vouchers'
    });
    if (result.response.status !== 200) throw new Error(`AI generate failed ${result.response.status}`);

    page = await client.follow('/dashboard/content-library');
    const post = await Post.findOne({ createdBy: smokeUser._id, status: 'draft' }).sort({ createdAt: -1 });
    if (!post) throw new Error('Missing generated draft post');
    const postId = post._id.toString();
    page = await client.follow(`/dashboard/content-library/${postId}/edit`);
    csrf = csrfFrom(page.text);
    result = await client.form(`/dashboard/actions/posts/${postId}/schedule`, {
      _csrf: csrf,
      scheduledAt: '2026-05-20T09:00'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Schedule failed ${result.response.status}`);

    const checks = [
      '/dashboard',
      '/dashboard/campaigns',
      '/dashboard/campaigns',
      '/dashboard/calendar',
      '/dashboard/media',
      `/dashboard/actions/media/signature?brand=${brandId}`,
      '/dashboard/video-system',
      '/dashboard/video-system',
      '/dashboard/avatar-video',
      '/dashboard/social',
      `/dashboard/actions/social/facebook/connect?brand=${brandId}`,
      '/dashboard/analytics',
      '/dashboard/approvals',
      '/dashboard/team',
      '/dashboard/billing',
      '/dashboard/notifications',
      '/dashboard/settings'
    ];

    for (const path of checks) {
      const checked = path.startsWith('/dashboard/actions/social/facebook/connect') ? await client.request(path) : await client.follow(path);
      const okStatuses = path.startsWith('/dashboard/actions/social/facebook/connect') ? [200, 302, 303] : [200];
      if (!okStatuses.includes(checked.response.status)) throw new Error(`${path} returned ${checked.response.status}`);
    }

    page = await client.follow('/dashboard/campaigns');
    csrf = csrfFrom(page.text);
    result = await client.form('/dashboard/actions/growth-studio/run', {
      _csrf: csrf,
      brand: brandId,
      actionType: 'draft_batch',
      platforms: 'facebook, instagram',
      campaignGoal: 'Sell weekend vouchers'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Growth Studio drafts failed ${result.response.status}`);

    page = await client.follow('/dashboard/campaigns');
    csrf = csrfFrom(page.text);
    result = await client.form('/dashboard/actions/growth-studio/run', {
      _csrf: csrf,
      brand: brandId,
      actionType: 'brand_audit',
      campaignGoal: 'Improve brand readiness'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Growth Studio audit failed ${result.response.status}`);

    page = await client.follow('/dashboard/quick-create');
    csrf = csrfFrom(page.text);
    result = await client.form('/dashboard/actions/ai/generate-hashtags', {
      _csrf: csrf,
      brand: brandId,
      goal: 'Sell weekend vouchers'
    });
    if (result.response.status !== 200) throw new Error(`Hashtag generation failed ${result.response.status}`);

    csrf = csrfFrom(result.text);
    result = await client.form('/dashboard/actions/ai/generate-video-script', {
      _csrf: csrf,
      brand: brandId,
      platform: 'Instagram Reels',
      goal: 'Sell weekend vouchers',
      offer: 'Weekend bundle',
      style: 'clean local'
    });
    if (result.response.status !== 200) throw new Error(`Video script generation failed ${result.response.status}`);

    csrf = csrfFrom(result.text);
    result = await client.form('/dashboard/actions/ai/generate-campaign', {
      _csrf: csrf,
      brand: brandId,
      name: 'Smoke Campaign',
      platforms: 'facebook, instagram',
      durationDays: '3',
      goal: 'Sell weekend vouchers'
    });
    if (result.response.status !== 200) throw new Error(`AI campaign failed ${result.response.status}`);

    page = await client.follow('/dashboard/campaigns');
    csrf = csrfFrom(page.text);
    const campaignDraftPath = String(page.text).match(/\/dashboard\/actions\/campaigns\/([a-f0-9]{24})\/create-drafts/);
    if (!campaignDraftPath) throw new Error('Missing campaign create-drafts action');
    result = await client.form(`/dashboard/actions/campaigns/${campaignDraftPath[1]}/create-drafts`, { _csrf: csrf });
    if (![302, 303].includes(result.response.status)) throw new Error(`Campaign draft creation failed ${result.response.status}`);

    page = await client.follow('/dashboard/media');
    csrf = csrfFrom(page.text);
    result = await client.form('/dashboard/actions/media/upload', {
      _csrf: csrf,
      brand: brandId,
      fileName: 'Smoke product photo',
      tags: 'product, smoke',
      fileType: 'image',
      mimeType: 'image/jpeg',
      fileUrl: 'https://example.com/product.jpg',
      consentRequired: 'on'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Media upload failed ${result.response.status}`);

    page = await client.follow('/dashboard/media');
    csrf = csrfFrom(page.text);
    const mediaMatch = String(page.text).match(/\/dashboard\/actions\/media\/([a-f0-9]{24})\/creative/);
    if (!mediaMatch) throw new Error('Missing media creative action');
    result = await client.form(`/dashboard/actions/media/${mediaMatch[1]}/creative`, {
      _csrf: csrf,
      actionType: 'prompt'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Media creative action failed ${result.response.status}`);

    result = await client.form(`/dashboard/actions/media/${mediaMatch[1]}/creative`, {
      _csrf: csrf,
      actionType: 'accept_consent'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Media consent action failed ${result.response.status}`);

    result = await client.form(`/dashboard/actions/media/${mediaMatch[1]}/create-draft`, {
      _csrf: csrf,
      platform: 'instagram'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Media draft creation failed ${result.response.status}`);

    page = await client.follow('/dashboard/quick-create');
    csrf = csrfFrom(page.text);
    result = await client.form('/dashboard/actions/ai/generate-post', {
      _csrf: csrf,
      brand: brandId,
      platform: 'instagram',
      contentType: 'offer',
      goal: 'Reuse uploaded product image',
      sourceMedia: mediaMatch[1]
    });
    if (result.response.status !== 200) throw new Error(`Media-powered AI generate failed ${result.response.status}`);

    page = await client.follow('/dashboard/campaigns');
    csrf = csrfFrom(page.text);
    result = await client.form('/dashboard/actions/growth-studio/run', {
      _csrf: csrf,
      brand: brandId,
      actionType: 'video_storyboard',
      platforms: 'instagram',
      campaignGoal: 'Use uploaded media in a video',
      sourceMedia: mediaMatch[1]
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Media-powered Growth Studio video failed ${result.response.status}`);

    page = await client.follow('/dashboard/video-system');
    csrf = csrfFrom(page.text);
    const templateId = optionValueForSelect(page.text, 'template');
    result = await client.form('/dashboard/actions/templates/render', {
      _csrf: csrf,
      brand: brandId,
      template: templateId,
      headline: 'Weekend vouchers',
      offer: 'Extra data for students',
      cta: 'Buy now'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Template render failed ${result.response.status}`);

    page = await client.follow('/dashboard/video-system');
    csrf = csrfFrom(page.text);
    result = await client.form('/dashboard/actions/videos/clean-generate', {
      _csrf: csrf,
      brand: brandId,
      provider: 'pending_video_provider',
      platform: 'Instagram Reels',
      aspectRatio: '9:16',
      durationSeconds: '20',
      offer: 'Weekend bundle',
      prompt: 'Create a clean vertical promo video for weekend internet vouchers.',
      style: 'clean local',
      sourceMedia: mediaMatch[1]
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Clean video failed ${result.response.status}`);

    page = await client.follow('/dashboard/avatar-video');
    csrf = csrfFrom(page.text);
    result = await client.form('/dashboard/actions/avatars', {
      _csrf: csrf,
      brand: brandId,
      name: 'Smoke avatar',
      sourceMedia: mediaMatch[1],
      allowedUse: 'brand_content',
      ownershipConfirmed: 'on'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Avatar create failed ${result.response.status}`);

    page = await client.follow('/dashboard/avatar-video');
    csrf = csrfFrom(page.text);
    const avatarMatch = String(page.text).match(/\/dashboard\/actions\/avatars\/([a-f0-9]{24})\/generate-video/);
    if (!avatarMatch) throw new Error('Missing avatar video action');
    result = await client.form(`/dashboard/actions/avatars/${avatarMatch[1]}/generate-video`, {
      _csrf: csrf,
      script: 'Hello, this is a short AI-generated brand announcement.',
      aspectRatio: '9:16',
      durationSeconds: '30'
    });
    if (![302, 303].includes(result.response.status)) throw new Error(`Avatar video failed ${result.response.status}`);

    page = await client.follow('/dashboard/billing/checkout/starter');
    if (!String(page.text).includes('Pesapal')) throw new Error('Checkout page must show Pesapal payment');
    csrf = csrfFrom(page.text);
    if (env.pesapalConsumerKey && env.pesapalConsumerSecret && env.pesapalIpnId) {
      result = await client.form('/dashboard/billing/checkout/starter', {
        _csrf: csrf,
        provider: 'pesapal'
      });
      if (![302, 303].includes(result.response.status)) throw new Error(`Pesapal checkout failed ${result.response.status}`);
    }

    page = await client.follow('/dashboard/settings');
    csrf = csrfFrom(page.text);
    result = await client.form('/dashboard/actions/settings/diagnostics', { _csrf: csrf });
    if (result.response.status !== 200) throw new Error(`Diagnostics failed ${result.response.status}`);

    console.log('FEATURE_SMOKE_OK');
  } finally {
    await cleanup(email);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
