const Brand = require('../../models/Brand');
const User = require('../../models/User');
const Post = require('../../models/Post');
const AiVideoJob = require('../../models/AiVideoJob');
const Campaign = require('../../models/Campaign');
const SocialAccount = require('../../models/SocialAccount');
const Approval = require('../../models/Approval');
const Notification = require('../../models/Notification');
const Media = require('../../models/Media');
const Analytics = require('../../models/Analytics');
const GrowthAsset = require('../../models/GrowthAsset');
const TeamMember = require('../../models/TeamMember');
const Subscription = require('../../models/Subscription');
const SubscriptionPlan = require('../../models/SubscriptionPlan');
const Payment = require('../../models/Payment');
const VideoTemplate = require('../../models/VideoTemplate');
const VideoRender = require('../../models/VideoRender');
const AvatarProfile = require('../../models/AvatarProfile');
const ApiLog = require('../../models/ApiLog');
const AuditLog = require('../../models/AuditLog');
const { getCurrentPlan, plainPlan } = require('../../services/subscription.service');
const { buildFeatureAccess, resolveDashboardPageForAccess } = require('../../services/subscription/featureAccess.service');
const { buildUsageDashboard } = require('../../services/usage.service');
const { getPublicPricingCards } = require('../../services/pricing.service');
const { updateBrandPerformanceMemoryForOwner } = require('../../services/analyticsMemoryService');

const DASHBOARD_TIME_ZONE = process.env.APP_TIME_ZONE || process.env.TIME_ZONE || process.env.TZ || 'Africa/Kampala';

function compactNumber(value) {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}m`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
  return String(number);
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function isRealSocialAccount(account) {
  return account.status !== 'mock' && !String(account.accountName || '').toLowerCase().includes('(development)');
}

function initials(name = '') {
  const parts = String(name || 'User')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (parts[0]?.[0] || 'U') + (parts[1]?.[0] || parts[0]?.[1] || '');
}

function truncate(value, length = 86) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1).trim()}...`;
}

function countMap(rows = []) {
  return rows.reduce((map, row) => {
    map[row._id || 'unknown'] = row.count;
    return map;
  }, {});
}

function sum(values = []) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

const PAGE_ALIASES = {
  'post-editor': 'content-library',
  posts: 'content-library',
  drafts: 'content-library',
  roles: 'team',
  users: 'team',
  'content-generator': 'quick-create',
  'ai-generator': 'quick-create',
  templates: 'video-system',
  'image-workflows': 'media',
  'growth-studio': 'campaigns',
  'avatar-consent': 'avatar-video',
  'auto-handoff': 'approvals',
  handoff: 'approvals',
  integrations: 'social',
  whatsapp: 'social',
  security: 'settings',
  billings: 'billing',
  'admin-plans': 'plans',
  'admin/plans': 'plans',
  plans: 'plans'
};
const DASHBOARD_PAGES = [
  'overview',
  'quick-create',
  'team',
  'brand-brain',
  'content-library',
  'campaigns',
  'media',
  'video-system',
  'avatar-video',
  'calendar',
  'social',
  'approvals',
  'analytics',
  'notifications',
  'billing',
  'settings',
  'admin',
  'plans'
];

const ROLE_PAGE_ACCESS = {
  super_admin: DASHBOARD_PAGES,
  agency_owner: DASHBOARD_PAGES.filter((page) => !['admin', 'plans'].includes(page)),
  brand_owner: DASHBOARD_PAGES.filter((page) => !['admin', 'plans'].includes(page)),
  content_creator: [
    'overview', 'quick-create', 'brand-brain', 'content-library',
    'campaigns', 'media', 'video-system', 'avatar-video',
    'calendar', 'social', 'approvals', 'analytics', 'notifications', 'settings'
  ],
  client_reviewer: ['overview', 'content-library', 'calendar', 'approvals', 'analytics', 'notifications', 'settings'],
  team_member: ['overview', 'quick-create', 'content-library', 'media', 'calendar', 'approvals', 'analytics', 'notifications', 'settings']
};

function dashboardRole(role) {
  return ROLE_PAGE_ACCESS[role] ? role : 'brand_owner';
}

function pagesForRole(role) {
  return [...new Set(ROLE_PAGE_ACCESS[dashboardRole(role)] || ROLE_PAGE_ACCESS.brand_owner)];
}

function resolveDashboardPage(page) {
  const raw = String(page || 'overview').trim();
  return PAGE_ALIASES[raw] || raw || 'overview';
}

function roleCapabilities(role) {
  const normalized = dashboardRole(role);
  const pages = pagesForRole(normalized);
  const has = (page) => pages.includes(page);
  return {
    role: normalized,
    canManageUsers: has('team'),
    canManageBilling: has('billing'),
    canManageAdmin: has('admin'),
    canConnectSocial: has('social'),
    canCreateContent: has('quick-create'),
    canApprove: has('approvals'),
    canViewAnalytics: has('analytics')
  };
}

function canViewPlanManagement(user = {}) {
  const role = String(user.role || '').toLowerCase();
  if (['super_admin', 'billing_admin', 'ai_manager', 'platform_admin'].includes(role)) return true;
  return Array.isArray(user.permissions) && user.permissions.some((permission) => ['*', 'plans.view'].includes(permission));
}


function recordId(record) {
  return record?._id?.toString?.() || (record?.id ? String(record.id) : '');
}

function listPreview(values = [], limit = 6) {
  if (!Array.isArray(values)) return values || '';
  const cleaned = values
    .map((item) => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      if (item.title || item.name) return [item.title || item.name, item.description || item.quote || item.url].filter(Boolean).join(' | ');
      return JSON.stringify(item);
    })
    .filter(Boolean);
  const visible = cleaned.slice(0, limit).join(', ');
  return cleaned.length > limit ? `${visible}, +${cleaned.length - limit} more` : visible;
}

function compactDetails(details = {}) {
  return Object.entries(details).reduce((map, [key, value]) => {
    if (value === undefined || value === null || value === '') return map;
    if (Array.isArray(value)) {
      if (!value.length) return map;
      map[key] = listPreview(value, 12);
      return map;
    }
    if (value instanceof Date) {
      map[key] = formatDateTime(value);
      return map;
    }
    if (typeof value === 'object') {
      const rendered = Object.entries(value)
        .filter(([, item]) => item !== undefined && item !== null && item !== '')
        .map(([itemKey, itemValue]) => `${titleCase(itemKey)}: ${Array.isArray(itemValue) ? listPreview(itemValue, 8) : itemValue}`)
        .join(' | ');
      if (rendered) map[key] = rendered;
      return map;
    }
    map[key] = value;
    return map;
  }, {});
}

function card(title, description, tag, options = {}) {
  const safeTitle = title || options.title || 'Untitled record';
  const safeDescription = description || options.description || '';
  const safeTag = tag || options.status || options.tag || 'Record';
  return {
    id: options.id || '',
    kind: options.kind || 'record',
    title: safeTitle,
    description: safeDescription,
    tag: safeTag,
    status: options.status || safeTag,
    href: options.href || '',
    editHref: options.editHref || '',
    editAction: options.editAction || '',
    editMethod: options.editMethod || '',
    editFields: options.editFields || [],
    actionHref: options.actionHref || '',
    actionLabel: options.actionLabel || '',
    actionMethod: options.actionMethod || '',
    actions: Array.isArray(options.actions) ? options.actions : [],
    deleteAction: options.deleteAction || '',
    deleteLabel: options.deleteLabel || '',
    deleteMethod: options.deleteMethod || '',
    mediaUrl: options.mediaUrl || '',
    mediaType: options.mediaType || '',
    mediaAlt: options.mediaAlt || safeTitle,
    media: Array.isArray(options.media) ? options.media : [],
    details: compactDetails({
      Title: safeTitle,
      Description: safeDescription,
      Status: safeTag,
      ...(options.details || {})
    })
  };
}

function row(title, description, status) {
  return [title, description, status];
}

function fallbackCards(cards) {
  return cards || [];
}

function timeZoneParts(date, includeTime = false) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const options = {
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' } : {})
  };
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(parsed).reduce((map, part) => {
    if (part.type !== 'literal') map[part.type] = part.value;
    return map;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
    second: Number(parts.second || 0),
    yearText: parts.year,
    monthText: parts.month,
    dayText: parts.day,
    hourText: parts.hour || '00',
    minuteText: parts.minute || '00'
  };
}

function timeZoneOffsetMinutes(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((map, part) => {
    if (part.type !== 'literal') map[part.type] = part.value;
    return map;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour || 0),
    Number(parts.minute || 0),
    Number(parts.second || 0)
  );
  return (asUtc - date.getTime()) / 60000;
}

function zonedLocalTimeToUtc(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let offset = timeZoneOffsetMinutes(DASHBOARD_TIME_ZONE, new Date(utc));
  utc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offset * 60000;
  offset = timeZoneOffsetMinutes(DASHBOARD_TIME_ZONE, new Date(utc));
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offset * 60000);
}

function calendarMonthParts(date) {
  const parts = timeZoneParts(date) || timeZoneParts(new Date());
  return { year: parts.year, month: parts.month, monthIndex: parts.month - 1 };
}

function calendarGridDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
}

function calendarGridKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function formatDate(date) {
  if (!date) return 'No date';
  return new Intl.DateTimeFormat('en', { timeZone: DASHBOARD_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date));
}

function formatDateTime(date) {
  if (!date) return 'No date';
  return new Intl.DateTimeFormat('en', {
    timeZone: DASHBOARD_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}

function dateTimeLocalValue(date) {
  if (!date) return '';
  const parts = timeZoneParts(date, true);
  if (!parts) return '';
  return `${parts.yearText}-${parts.monthText}-${parts.dayText}T${parts.hourText}:${parts.minuteText}`;
}

function formatTime(date) {
  if (!date) return 'Any time';
  return new Intl.DateTimeFormat('en', { timeZone: DASHBOARD_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

function timeAgo(date) {
  if (!date) return 'No activity date';
  const diff = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(diff)) return 'No activity date';
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes || 1} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function autoPostingSummary(brand) {
  const auto = brand.autoPosting || {};
  const unit = auto.frequencyUnit || 'week';
  const count = unit === 'day' ? auto.postsPerDay || 1 : unit === 'month' ? auto.postsPerMonth || 30 : auto.postsPerWeek || 7;
  const slots = Array.isArray(auto.preferredSlots) && auto.preferredSlots.length ? auto.preferredSlots.join(', ') : 'no saved slots';
  const media = Array.isArray(auto.mediaMix) && auto.mediaMix.length ? auto.mediaMix.join(', ') : 'auto media';
  return `${auto.enabled ? 'Enabled' : 'Off'} · ${count}/${unit} · ${slots} · ${media}`;
}

function tokenStatusDescription(account) {
  const expires = account.tokenExpiresAt ? `expires ${formatDate(account.tokenExpiresAt)}` : 'no expiry saved';
  const synced = account.lastSyncAt ? `last sync ${timeAgo(account.lastSyncAt)}` : 'not synced yet';
  return `${titleCase(account.platform)} · ${account.brand?.name || 'Workspace'} · ${expires} · ${synced}`;
}

function startOfMonth(date) {
  const { year, month } = calendarMonthParts(date);
  return zonedLocalTimeToUtc(year, month, 1, 0, 0, 0, 0);
}

function endOfMonth(date) {
  const { year, month } = calendarMonthParts(date);
  return new Date(zonedLocalTimeToUtc(year, month + 1, 1, 0, 0, 0, 0).getTime() - 1);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function dayKey(date) {
  const parts = timeZoneParts(date);
  return parts ? `${parts.yearText}-${parts.monthText}-${parts.dayText}` : '';
}

function parseMonthValue(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (match) return calendarGridDate(Number(match[1]), Number(match[2]) - 1, 15);
  return new Date();
}

function monthValue(date) {
  const { year, month } = calendarMonthParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat('en', { timeZone: DASHBOARD_TIME_ZONE, month: 'long', year: 'numeric' }).format(new Date(date));
}

function serializeCalendarPost(post) {
  const when = post.scheduledAt || post.publishedAt || post.createdAt;
  const safeWhen = when ? new Date(when) : null;
  return {
    id: post._id.toString(),
    title: postTitle(post),
    caption: truncate(post.caption || '', 180),
    fullCaption: post.caption || '',
    status: post.status || 'draft',
    platform: post.platform || 'facebook',
    type: post.type || 'text',
    hashtags: post.hashtags || [],
    brandId: post.brand?._id?.toString() || '',
    brandName: post.brand?.name || 'Missing brand',
    scheduledAt: post.scheduledAt ? new Date(post.scheduledAt).toISOString() : '',
    publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString() : '',
    createdAt: post.createdAt ? new Date(post.createdAt).toISOString() : '',
    dateKey: safeWhen ? dayKey(safeWhen) : '',
    dateLabel: safeWhen ? formatDate(safeWhen) : 'No date',
    dateTimeLabel: safeWhen ? formatDateTime(safeWhen) : 'No date',
    timeLabel: safeWhen ? formatTime(safeWhen) : 'Any time',
    targetAccounts: (post.targetAccounts || []).map((account) => ({
      id: account._id?.toString?.() || '',
      name: account.accountName || account.name || 'Account',
      platform: account.platform || post.platform || ''
    })),
    publishResults: (post.publishResults || []).map((result) => ({
      accountName: result.accountName || 'Account',
      status: result.status || 'published',
      platformPostId: result.platformPostId || '',
      errorMessage: result.errorMessage || ''
    })),
    media: (post.media || []).map((asset) => ({
      id: asset._id?.toString?.() || '',
      name: asset.fileName || 'Media',
      url: mediaUrlFromRecord(asset),
      type: mediaTypeFromRecord(asset, post.type),
      consentStatus: asset.consentStatus || ''
    })).filter((asset) => asset.url),
    mediaUrl: mediaUrlFromRecord(firstRenderableMedia(post.media || [])),
    mediaType: mediaTypeFromRecord(firstRenderableMedia(post.media || []), post.type)
  };
}

function buildCalendarMonthData(monthDate, posts = []) {
  const { year, month, monthIndex } = calendarMonthParts(monthDate);
  const first = calendarGridDate(year, monthIndex, 1);
  const last = calendarGridDate(year, monthIndex + 1, 0);
  const gridStart = addDays(first, -first.getUTCDay());
  const gridEnd = addDays(last, 6 - last.getUTCDay());
  const serializedPosts = posts
    .map(serializeCalendarPost)
    .filter((post) => post.dateKey)
    .sort((a, b) => String(a.scheduledAt || a.publishedAt || a.createdAt).localeCompare(String(b.scheduledAt || b.publishedAt || b.createdAt)));
  const postsByDay = serializedPosts.reduce((map, post) => {
    if (!map.has(post.dateKey)) map.set(post.dateKey, []);
    map.get(post.dateKey).push(post);
    return map;
  }, new Map());
  const todayKey = dayKey(new Date());
  const days = [];
  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    const key = calendarGridKey(cursor);
    days.push({
      key,
      dayNumber: cursor.getUTCDate(),
      inMonth: cursor.getUTCFullYear() === year && cursor.getUTCMonth() === monthIndex,
      isToday: key === todayKey,
      dateLabel: new Intl.DateTimeFormat('en', { timeZone: DASHBOARD_TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(cursor),
      posts: postsByDay.get(key) || []
    });
  }
  return {
    monthLabel: monthLabel(calendarGridDate(year, monthIndex, 15)),
    monthValue: `${year}-${String(month).padStart(2, '0')}`,
    todayKey,
    previousMonth: monthValue(calendarGridDate(year, monthIndex - 1, 15)),
    nextMonth: monthValue(calendarGridDate(year, monthIndex + 1, 15)),
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    days,
    posts: serializedPosts
  };
}

function listText(values = []) {
  return (values || []).filter(Boolean).join('\n');
}

function productText(products = []) {
  return (products || [])
    .map((product) => [product.name, product.price, product.description].filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

function offerText(offers = []) {
  return (offers || [])
    .map((offer) => [offer.title, offer.description].filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

function socialLinkText(links = []) {
  return (links || [])
    .map((link) => [link.platform, link.url].filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

function testimonialText(testimonials = []) {
  return (testimonials || [])
    .map((testimonial) => [testimonial.author, testimonial.quote].filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

function platformLanguageText(platformLanguages = {}) {
  return Object.entries(platformLanguages || {})
    .map(([platform, language]) => `${platform} | ${language}`)
    .join('\n');
}

function brandRecord(brand) {
  const autoPosting = brand.autoPosting || {};
  return {
    id: brand._id.toString(),
    name: brand.name,
    status: brand.status || 'active',
    logo: brand.logo || '',
    logoPublicId: brand.logoPublicId || '',
    favicon: brand.favicon || '',
    faviconPublicId: brand.faviconPublicId || '',
    coverImage: brand.coverImage || '',
    coverImagePublicId: brand.coverImagePublicId || '',
    businessType: brand.businessType || '',
    description: brand.description || '',
    website: brand.website || '',
    location: brand.location || '',
    language: brand.language || 'English',
    targetAudience: brand.targetAudience || '',
    tone: brand.tone || '',
    preferredCta: brand.preferredCta || '',
    localStyle: brand.localStyle || '',
    fontStyle: brand.fontStyle || '',
    postingFrequency: brand.postingFrequency || '',
    products: brand.products || [],
    offers: brand.offers || [],
    socialLinks: brand.socialLinks || [],
    customerPainPoints: brand.customerPainPoints || [],
    commonObjections: brand.commonObjections || [],
    testimonials: brand.testimonials || [],
    brandRules: brand.brandRules || [],
    goals: brand.goals || [],
    preferredHashtags: brand.preferredHashtags || [],
    blockedWords: brand.blockedWords || [],
    competitors: brand.competitors || [],
    brandColors: brand.brandColors || [],
    autoPosting: {
      enabled: Boolean(autoPosting.enabled),
      postsPerDay: autoPosting.postsPerDay || 1,
      postsPerWeek: autoPosting.postsPerWeek || 7,
      postsPerMonth: autoPosting.postsPerMonth || 30,
      frequencyUnit: autoPosting.frequencyUnit || 'week',
      preferredSlots: autoPosting.preferredSlots || [],
      platformLanguages: autoPosting.platformLanguages || {},
      mediaMix: autoPosting.mediaMix || [],
      imagesPerPostMin: autoPosting.imagesPerPostMin || 1,
      imagesPerPostMax: autoPosting.imagesPerPostMax || 3,
      customerGoal: autoPosting.customerGoal || '',
      requireMedia: autoPosting.requireMedia !== false,
      strengthTarget: autoPosting.strengthTarget || 90
    },
    form: {
      products: productText(brand.products),
      offers: offerText(brand.offers),
      socialLinks: socialLinkText(brand.socialLinks),
      customerPainPoints: listText(brand.customerPainPoints),
      commonObjections: listText(brand.commonObjections),
      testimonials: testimonialText(brand.testimonials),
      brandRules: listText(brand.brandRules),
      goals: listText(brand.goals),
      preferredHashtags: listText(brand.preferredHashtags),
      blockedWords: listText(brand.blockedWords),
      competitors: listText(brand.competitors),
      brandColors: listText(brand.brandColors),
      autoPreferredSlots: listText(autoPosting.preferredSlots),
      autoMediaMix: listText(autoPosting.mediaMix),
      platformLanguages: platformLanguageText(autoPosting.platformLanguages)
    },
    updatedAt: brand.updatedAt,
    createdAt: brand.createdAt
  };
}

function postTitle(post) {
  return post.title || truncate(post.caption, 48) || `${titleCase(post.platform)} post`;
}

function postDescription(post) {
  const brandName = post.brand?.name || 'No brand';
  const platform = titleCase(post.platform);
  const type = titleCase(post.type);
  return `${brandName} · ${platform} · ${type}`;
}

function mediaUrlFromRecord(record) {
  if (!record) return '';
  if (record.fileUrl) return record.fileUrl;
  if (record.outputUrl) return record.outputUrl;
  if (Array.isArray(record.variants)) {
    const readyVariant = record.variants.find((variant) => variant.url && (!variant.status || variant.status === 'ready')) || record.variants.find((variant) => variant.url);
    if (readyVariant) return readyVariant.url;
  }
  return '';
}

function mediaTypeFromRecord(record, fallback = '') {
  if (!record) return fallback || '';
  const url = mediaUrlFromRecord(record).toLowerCase().split('?')[0];
  const declared = String(record.fileType || record.type || fallback || '').toLowerCase();
  if (declared.includes('video')) return 'video';
  if (declared.includes('image')) return 'image';
  if (/\.(mp4|mov|webm|m4v)$/.test(url)) return 'video';
  if (/\.(png|jpe?g|webp|gif|avif)$/.test(url)) return 'image';
  return declared || 'other';
}

function firstRenderableMedia(mediaList = []) {
  const list = Array.isArray(mediaList) ? mediaList.filter(Boolean) : [];
  return list.find((asset) => mediaTypeFromRecord(asset) === 'video' && mediaUrlFromRecord(asset))
    || list.find((asset) => mediaTypeFromRecord(asset) === 'image' && mediaUrlFromRecord(asset))
    || list.find((asset) => mediaUrlFromRecord(asset));
}

function mediaDetails(mediaList = []) {
  const list = Array.isArray(mediaList) ? mediaList.filter(Boolean) : [];
  if (!list.length) return {};
  return {
    Media: list.map((asset) => [asset.fileName || asset.name || 'Media', mediaTypeFromRecord(asset), mediaUrlFromRecord(asset)].filter(Boolean).join(' | ')),
    'Media count': list.length
  };
}

function mediaListFromRecords(mediaList = [], fallbackType = '') {
  return (Array.isArray(mediaList) ? mediaList : [])
    .map((asset) => ({
      id: recordId(asset),
      title: asset?.fileName || asset?.name || 'Media',
      url: mediaUrlFromRecord(asset),
      type: mediaTypeFromRecord(asset, fallbackType),
      alt: asset?.fileName || asset?.name || 'Post media'
    }))
    .filter((asset) => asset.url);
}

function postCard(post, options = {}) {
  const mediaAsset = firstRenderableMedia(post.media || []);
  const postMedia = mediaListFromRecords(post.media || [], post.type);
  const postId = recordId(post);
  const when = post.scheduledAt || post.publishedAt || post.updatedAt || post.createdAt;
  return card(
    postTitle(post),
    options.description || `${postDescription(post)}${when ? ` · ${formatDateTime(when)}` : ''}`,
    titleCase(post.status || 'draft'),
    {
      id: postId,
      kind: 'post',
      href: '/dashboard/content-library',
      editHref: '/dashboard/content-library',
      editAction: postId ? `/posts/${postId}?_method=PUT` : '',
      editMethod: 'post',
      actions: postId ? [
        { label: (post.status === 'published' ? 'Repost' : 'Publish now'), action: `/posts/${postId}/publish-now`, method: 'post', kind: 'publish' },
        { label: 'Duplicate', action: `/posts/${postId}/duplicate`, method: 'post', kind: 'duplicate' },
        { label: 'Schedule', action: `/posts/${postId}/schedule`, method: 'post', kind: 'schedule' },
        { label: 'Cancel', action: `/posts/${postId}/cancel`, method: 'post', kind: 'cancel' }
      ] : [],
      deleteAction: postId ? `/posts/${postId}?_method=DELETE` : '',
      deleteLabel: 'Delete post',
      deleteMethod: 'post',
      editFields: [
        { name: 'title', label: 'Title', type: 'text', value: post.title || '', full: true },
        { name: 'caption', label: 'Caption', type: 'textarea', value: post.caption || '', rows: 5, full: true },
        { name: 'description', label: 'Description', type: 'textarea', value: post.description || '', rows: 3, full: true },
        { name: 'platform', label: 'Platform', type: 'select', value: post.platform || 'facebook', options: ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'whatsapp', 'twitter'] },
        { name: 'type', label: 'Type', type: 'select', value: post.type || 'text', options: ['text', 'image', 'carousel', 'video', 'avatar_video'] },
        { name: 'status', label: 'Status', type: 'select', value: post.status || 'draft', options: ['draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'] },
        { name: 'scheduledAt', label: 'Schedule time', type: 'datetime-local', value: dateTimeLocalValue(post.scheduledAt) },
        { name: 'hashtags', label: 'Hashtags', type: 'text', value: (post.hashtags || []).join(' '), full: true },
        { name: 'link', label: 'Link', type: 'url', value: post.link || '', full: true }
      ],
      mediaUrl: mediaUrlFromRecord(mediaAsset),
      mediaType: mediaTypeFromRecord(mediaAsset, post.type),
      mediaAlt: mediaAsset?.fileName || postTitle(post),
      media: postMedia,
      details: {
        Brand: post.brand?.name || 'No brand',
        Platform: titleCase(post.platform),
        Type: titleCase(post.type),
        Caption: post.caption,
        Description: post.description,
        Hashtags: post.hashtags,
        Link: post.link,
        Status: titleCase(post.status),
        'Scheduled at': post.scheduledAt ? formatDateTime(post.scheduledAt) : '',
        'Published at': post.publishedAt ? formatDateTime(post.publishedAt) : '',
        'Created at': post.createdAt ? formatDateTime(post.createdAt) : '',
        'Updated at': post.updatedAt ? formatDateTime(post.updatedAt) : '',
        'Target accounts': (post.targetAccounts || []).map((account) => account.accountName || account.name || String(account)),
        'Publish results': (post.publishResults || []).map((result) => [result.accountName, result.platform, result.status, result.errorMessage].filter(Boolean).join(' | ')),
        Error: post.errorMessage,
        ...mediaDetails(post.media || [])
      }
    }
  );
}

function buildDashboardData({
  user,
  brands,
  campaigns,
  socialAccounts,
  approvals,
  recentPosts,
  scheduledPosts,
  media,
  videoJobs,
  unreadCount,
  postStatus,
  postTypes,
  postPlatforms,
  socialStatus,
  campaignStatus,
  mediaTypes,
  videoStatus,
  approvalStatus,
  analyticsTotals,
  notifications = [],
  growthAssets = [],
  calendarMonthData = buildCalendarMonthData(new Date(), []),
  teamMembers = [],
  subscriptions = [],
  payments = [],
  videoTemplates = [],
  videoRenders = [],
  avatarProfiles = [],
  apiLogs = [],
  auditLogs = [],
  failedPosts = [],
  allUsers = [],
  adminPlans = [],
  planSubscriptionCounts = {},
  currentPlan = null,
  featureAccess = null,
  usageDashboard = null,
  publicPricingPlans = []
}) {
  socialAccounts = socialAccounts.filter(isRealSocialAccount);
  const userName = user.name || user.email || 'User';
  const plan = currentPlan?.slug || user.plan || 'free-trial';
  const planName = currentPlan?.name || titleCase(plan);
  const normalizedFeatureAccess = featureAccess || buildFeatureAccess({ user, plan: currentPlan });
  const primaryBrand = brands[0];
  const activeCampaigns = campaignStatus.active || 0;
  const draftPosts = postStatus.draft || 0;
  const pendingApprovals = approvalStatus.pending || 0;
  const scheduledCount = postStatus.scheduled || scheduledPosts.length || 0;
  const publishedCount = postStatus.published || 0;
  const failedCount = postStatus.failed || 0;
  const connectedAccounts = socialStatus.connected || 0;
  const connectedPlatforms = new Set(socialAccounts.map((account) => account.platform)).size;
  const imageCount = mediaTypes.image || 0;
  const videoMediaCount = mediaTypes.video || 0;
  const mediaTotal = sum(Object.values(mediaTypes));
  const videoJobTotal = sum(Object.values(videoStatus));
  const generatedAssets = sum(Object.values(postTypes)) + mediaTotal + videoJobTotal;
  const creditUsage = sum(videoJobs.map((job) => job.costCredits)) + generatedAssets;
  const productCount = sum(brands.map((brand) => brand.products?.length || 0));
  const offerCount = sum(brands.map((brand) => brand.offers?.length || 0));
  const ruleCount = sum(brands.map((brand) => brand.brandRules?.length || 0));
  const proofCount = sum(brands.map((brand) => brand.testimonials?.length || 0));
  const topPlatform = Object.entries(postPlatforms).sort((a, b) => b[1] - a[1])[0]?.[0] || 'facebook';

  const recentPostRows = recentPosts.map((post) =>
    row(postTitle(post), postDescription(post), titleCase(post.status))
  );
  const scheduledRows = scheduledPosts.map((post) =>
    row(postTitle(post), `${postDescription(post)} · ${formatDate(post.scheduledAt)}`, titleCase(post.status))
  );
  const recentPostCards = recentPosts.map((post) => postCard(post));
  const scheduledPostCards = scheduledPosts.map((post) => postCard(post));
  const campaignCards = campaigns.map((campaign) => card(
    campaign.name,
    truncate(campaign.description || campaign.goal || `${campaign.platforms?.join(', ') || 'Multi-platform'} campaign`),
    titleCase(campaign.status),
    {
      id: recordId(campaign),
      kind: 'campaign',
      href: '/dashboard/campaigns',
      editHref: '/dashboard/campaigns',
      editAction: `/campaigns/${recordId(campaign)}/status`,
      editMethod: 'post',
      editFields: [
        { name: 'status', label: 'Status', type: 'select', value: campaign.status || 'draft', options: ['draft', 'active', 'paused', 'completed', 'archived'] }
      ],
      details: {
        Brand: campaign.brand?.name || 'No brand',
        Goal: campaign.goal,
        Description: campaign.description,
        Platforms: campaign.platforms,
        'Posting frequency': campaign.postingFrequency,
        'Start date': campaign.startDate ? formatDate(campaign.startDate) : '',
        'End date': campaign.endDate ? formatDate(campaign.endDate) : '',
        Status: titleCase(campaign.status),
        'Content pillars': campaign.aiPlan?.contentPillars,
        'Suggested times': campaign.aiPlan?.suggestedTimes,
        'Post ideas': (campaign.aiPlan?.postIdeas || []).map((idea) => [idea.day ? `Day ${idea.day}` : '', idea.platform, idea.title, idea.caption].filter(Boolean).join(' | ')),
        'Updated at': campaign.updatedAt ? formatDateTime(campaign.updatedAt) : ''
      }
    }
  ));
  const brandCards = brands.map((brand) => card(
    brand.name,
    truncate(brand.description || brand.targetAudience || `${brand.businessType || 'Brand'} profile with saved AI memory.`),
    brand.status === 'active' ? 'Active' : titleCase(brand.status),
    {
      id: recordId(brand),
      kind: 'brand',
      href: '/dashboard/brand-brain',
      editHref: '/dashboard/brand-brain',
      editAction: `/brands/${recordId(brand)}?_method=PUT`,
      editMethod: 'post',
      editFields: [
        { name: 'name', label: 'Brand name', type: 'text', value: brand.name || '', required: true },
        { name: 'businessType', label: 'Business type', type: 'text', value: brand.businessType || '' },
        { name: 'description', label: 'Description', type: 'textarea', value: brand.description || '', rows: 4, full: true },
        { name: 'website', label: 'Website', type: 'url', value: brand.website || '' },
        { name: 'location', label: 'Location', type: 'text', value: brand.location || '' },
        { name: 'targetAudience', label: 'Target audience', type: 'textarea', value: brand.targetAudience || '', rows: 3, full: true },
        { name: 'tone', label: 'Tone of voice', type: 'text', value: brand.tone || '' },
        { name: 'preferredCta', label: 'CTA style', type: 'text', value: brand.preferredCta || '' },
        { name: 'brandColors', label: 'Brand colors', type: 'textarea', value: listText(brand.brandColors), rows: 3, full: true },
        { name: 'blockedWords', label: 'Blocked words', type: 'textarea', value: listText(brand.blockedWords), rows: 3, full: true }
      ],
      mediaUrl: brand.logo || '',
      mediaType: brand.logo ? 'image' : '',
      details: {
        'Business type': brand.businessType,
        Description: brand.description,
        Website: brand.website,
        Location: brand.location,
        Language: brand.language,
        Audience: brand.targetAudience,
        Tone: brand.tone,
        'Preferred CTA': brand.preferredCta,
        Products: brand.products,
        Offers: brand.offers,
        Goals: brand.goals,
        'Brand rules': brand.brandRules,
        'Preferred hashtags': brand.preferredHashtags,
        'Blocked words': brand.blockedWords,
        Competitors: brand.competitors,
        'Auto posting': autoPostingSummary(brand),
        'Updated at': brand.updatedAt ? formatDateTime(brand.updatedAt) : ''
      }
    }
  ));
  const socialCards = socialAccounts.map((account) => card(
    account.accountName,
    `${titleCase(account.platform)} · ${account.brand?.name || 'Workspace account'} · ${account.permissions?.length || 0} permissions`,
    titleCase(account.status),
    {
      id: recordId(account),
      kind: 'social_account',
      href: '/dashboard/social',
      editHref: '/dashboard/social',
      editAction: `/social/${recordId(account)}/update`,
      editMethod: 'post',
      actions: recordId(account) ? [
        { label: 'Reconnect', action: `/social/${recordId(account)}/reconnect`, method: 'post', kind: 'reconnect' },
        { label: 'Disconnect', action: `/social/${recordId(account)}/disconnect`, method: 'post', kind: 'disconnect', destructive: true }
      ] : [],
      deleteAction: recordId(account) ? `/social/${recordId(account)}/disconnect` : '',
      deleteLabel: 'Disconnect',
      deleteMethod: 'post',
      editFields: [
        { name: 'accountName', label: 'Account name', type: 'text', value: account.accountName || '', required: true },
        { name: 'accountId', label: 'Account ID', type: 'text', value: account.accountId || '' },
        { name: 'status', label: 'Status', type: 'select', value: account.status || 'connected', options: ['connected', 'mock', 'needs_reconnect', 'expired', 'failed', 'disconnected'] },
        { name: 'permissions', label: 'Permissions', type: 'text', value: (account.permissions || []).join(', ') },
        { name: 'accessToken', label: 'New access token', type: 'password', value: '', placeholder: 'Leave blank to keep current token' },
        { name: 'refreshToken', label: 'New refresh token', type: 'password', value: '', placeholder: 'Optional' }
      ],
      details: {
        Brand: account.brand?.name || 'Workspace account',
        Platform: titleCase(account.platform),
        'Account ID': account.accountId,
        Permissions: account.permissions,
        Status: titleCase(account.status),
        'Token expires': account.tokenExpiresAt ? formatDateTime(account.tokenExpiresAt) : '',
        'Last sync': account.lastSyncAt ? formatDateTime(account.lastSyncAt) : '',
        'Updated at': account.updatedAt ? formatDateTime(account.updatedAt) : ''
      }
    }
  ));
  const approvalCards = approvals.map((approval) => card(
    postTitle(approval.post || {}),
    approval.note || `${approval.reviewerEmail || 'Reviewer'} needs to review ${approval.post?.brand?.name || 'this post'}.`,
    titleCase(approval.status),
    {
      id: recordId(approval),
      kind: 'approval',
      href: '/dashboard/approvals',
      editHref: '/dashboard/approvals',
      mediaUrl: mediaUrlFromRecord(firstRenderableMedia(approval.post?.media || [])),
      mediaType: mediaTypeFromRecord(firstRenderableMedia(approval.post?.media || []), approval.post?.type),
      details: {
        Post: postTitle(approval.post || {}),
        Brand: approval.post?.brand?.name || '',
        Reviewer: approval.reviewerEmail,
        Note: approval.note,
        Status: titleCase(approval.status),
        'Resolved at': approval.resolvedAt ? formatDateTime(approval.resolvedAt) : '',
        'Requested at': approval.createdAt ? formatDateTime(approval.createdAt) : ''
      }
    }
  ));
  const mediaCards = media.map((asset) => card(
    asset.fileName,
    `${titleCase(asset.fileType)} · ${asset.brand?.name || 'Brand asset'} · ${compactNumber(asset.size)} bytes`,
    titleCase(asset.consentStatus || asset.fileType),
    {
      id: recordId(asset),
      kind: 'media',
      href: '/dashboard/media',
      editHref: '/dashboard/media',
      actions: recordId(asset) ? [
        { label: 'Create draft', action: `/media/${recordId(asset)}/create-draft`, method: 'post', kind: 'draft' }
      ] : [],
      deleteAction: recordId(asset) ? `/media/${recordId(asset)}?_method=DELETE` : '',
      deleteLabel: 'Delete media',
      deleteMethod: 'post',
      mediaUrl: mediaUrlFromRecord(asset),
      mediaType: mediaTypeFromRecord(asset),
      mediaAlt: asset.fileName,
      details: {
        Brand: asset.brand?.name || 'Brand asset',
        Type: titleCase(asset.fileType),
        URL: asset.fileUrl,
        'Public ID': asset.publicId,
        MIME: asset.mimeType,
        Size: `${compactNumber(asset.size)} bytes`,
        Folder: asset.folder,
        Tags: asset.tags,
        'Consent required': asset.consentRequired ? 'Yes' : 'No',
        'Consent status': titleCase(asset.consentStatus),
        'AI prompt': asset.aiPrompt,
        Summary: asset.aiInsights?.summary,
        'Content angles': asset.aiInsights?.contentAngles,
        'Recommended platforms': asset.aiInsights?.recommendedPlatforms,
        Variants: (asset.variants || []).map((variant) => [variant.label || variant.kind, variant.status, variant.url].filter(Boolean).join(' | ')),
        'Created at': asset.createdAt ? formatDateTime(asset.createdAt) : ''
      }
    }
  ));
  const videoCards = videoJobs.map((job) => {
    const sceneMedia = (job.scenePlan || []).find((scene) => scene.outputUrl);
    return card(
      job.prompt ? truncate(job.prompt, 44) : `${titleCase(job.mode)} video`,
      `${job.brand?.name || 'Brand'} · ${job.aspectRatio} · ${job.durationSeconds}s · ${job.scenePlan?.length || 0} scenes`,
      titleCase(job.status),
      {
        id: recordId(job),
        kind: 'ai_video_job',
        href: '/dashboard/video-system',
        editHref: '/dashboard/video-system',
        editAction: `/videos/${recordId(job)}/status`,
        editMethod: 'post',
        editFields: [
          { name: 'status', label: 'Status', type: 'select', value: job.status || 'planning', options: ['planning', 'queued', 'rendering', 'completed', 'failed', 'cancelled'] },
          { name: 'outputUrl', label: 'Output URL', type: 'url', value: job.outputUrl || '', full: true },
          { name: 'errorMessage', label: 'Error message', type: 'textarea', value: job.errorMessage || '', rows: 3, full: true }
        ],
        mediaUrl: job.outputUrl || sceneMedia?.outputUrl || '',
        mediaType: job.outputUrl || sceneMedia?.outputUrl ? 'video' : '',
        details: {
          Brand: job.brand?.name || 'Brand',
          Provider: job.provider,
          Mode: titleCase(job.mode),
          Prompt: job.prompt,
          'Aspect ratio': job.aspectRatio,
          Duration: `${job.durationSeconds || 0}s`,
          Status: titleCase(job.status),
          'Output URL': job.outputUrl,
          Scenes: (job.scenePlan || []).map((scene) => [scene.order, scene.title, scene.status, scene.outputUrl].filter(Boolean).join(' | ')),
          Credits: job.costCredits,
          Error: job.errorMessage,
          'Updated at': job.updatedAt ? formatDateTime(job.updatedAt) : ''
        }
      }
    );
  });

  const notificationCards = notifications.map((notification) => card(
    notification.title || titleCase(notification.type || 'Notification'),
    truncate(notification.body || notification.message || 'Workspace notification'),
    notification.readAt ? 'Read' : 'Unread',
    {
      id: recordId(notification),
      kind: 'notification',
      href: '/dashboard/notifications',
      editHref: '/dashboard/notifications',
      details: {
        Type: titleCase(notification.type),
        Message: notification.message || notification.body,
        'Entity type': notification.entityType,
        'Entity ID': notification.entityId,
        Read: notification.readAt ? formatDateTime(notification.readAt) : 'Unread',
        'Created at': notification.createdAt ? formatDateTime(notification.createdAt) : ''
      }
    }
  ));
  const growthCards = growthAssets.map((asset) => card(
    asset.title || titleCase(asset.type || 'Growth asset'),
    truncate(asset.summary || `${asset.brand?.name || 'Brand'} · ${titleCase(asset.type || 'growth asset')}`),
    titleCase(asset.type || 'Growth'),
    {
      id: recordId(asset),
      kind: 'growth_asset',
      href: '/dashboard/campaigns',
      editHref: '/dashboard/campaigns',
      details: {
        Brand: asset.brand?.name || 'Brand',
        Type: titleCase(asset.type),
        Summary: asset.summary,
        Sections: (asset.sections || []).map((section) => [section.heading, listPreview(section.items, 10)].filter(Boolean).join(' | ')),
        Metadata: asset.metadata,
        'Created at': asset.createdAt ? formatDateTime(asset.createdAt) : ''
      }
    }
  ));
  const teamCards = teamMembers.map((member) => card(
    member.name || member.email || 'Team member',
    `${member.brand?.name || 'Workspace'} · ${titleCase(member.role || 'member')} · ${(member.permissions || []).length} permission${(member.permissions || []).length === 1 ? '' : 's'}`,
    titleCase(member.status || 'invited'),
    {
      id: recordId(member),
      kind: 'team_member',
      href: '/dashboard/team',
      editHref: '/dashboard/team',
      editAction: `/team/${recordId(member)}`,
      editMethod: 'post',
      editFields: [
        { name: 'role', label: 'Role', type: 'select', value: member.role || 'content_creator', options: ['admin', 'manager', 'content_creator', 'editor', 'reviewer', 'viewer'] },
        { name: 'permissions', label: 'Permissions', type: 'text', value: (member.permissions || []).join(', '), full: true }
      ],
      deleteAction: recordId(member) ? `/team/${recordId(member)}/remove` : '',
      deleteLabel: 'Remove member',
      deleteMethod: 'post',
      details: {
        Brand: member.brand?.name || 'Workspace',
        Name: member.name,
        Email: member.email,
        Role: titleCase(member.role),
        Permissions: member.permissions,
        Status: titleCase(member.status),
        'Invite expires': member.inviteExpiresAt ? formatDateTime(member.inviteExpiresAt) : '',
        Accepted: member.acceptedAt ? formatDateTime(member.acceptedAt) : '',
        'Updated at': member.updatedAt ? formatDateTime(member.updatedAt) : ''
      }
    }
  ));
  const roleDashboardCards = [
    { role: 'super_admin', label: 'Super admin', summary: 'All platform, users, billing, security and admin operations.' },
    { role: 'agency_owner', label: 'Agency owner', summary: 'All client brand, team, billing, publishing and reporting workspaces.' },
    { role: 'brand_owner', label: 'Brand owner', summary: 'Full brand workspace with users, billing, social, content and approvals.' },
    { role: 'content_creator', label: 'Content creator', summary: 'Create, edit, schedule, media, campaign and analytics workflows.' },
    { role: 'client_reviewer', label: 'Client reviewer', summary: 'Approvals, calendar, content review, analytics and notifications.' },
    { role: 'team_member', label: 'Team member', summary: 'Assigned production and review workflows based on permissions.' }
  ].map((roleInfo) => card(roleInfo.label, roleInfo.summary, roleInfo.role === dashboardRole(user.role) ? 'Current role' : 'Role view', {
    kind: 'role_profile',
    href: '/dashboard/team',
    editHref: '/dashboard/team',
    details: {
      Role: roleInfo.label,
      Summary: roleInfo.summary,
      'Dashboard pages': pagesForRole(roleInfo.role).map(titleCase).join(', '),
      Current: roleInfo.role === dashboardRole(user.role) ? 'Yes' : 'No'
    }
  }));
  const ownerUserCard = card(userName, `${user.email || 'No email'} · ${titleCase(user.role || 'brand_owner')} · ${titleCase(user.status || 'active')}`, titleCase(user.status || 'active'), {
    id: recordId(user),
    kind: 'user',
    href: '/dashboard/team',
    editHref: '/dashboard/settings',
    details: {
      Name: userName,
      Email: user.email,
      Role: titleCase(user.role || 'brand_owner'),
      Plan: planName,
      Status: titleCase(user.status || 'active'),
      Verified: user.isVerified ? 'Yes' : 'No',
      'Last login': user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '',
      'Created at': user.createdAt ? formatDateTime(user.createdAt) : ''
    }
  });
  const adminUserCards = dashboardRole(user.role) === 'super_admin' && allUsers.length
    ? allUsers.map((workspaceUser) => card(workspaceUser.name || workspaceUser.email || 'User', `${workspaceUser.email || 'No email'} · ${titleCase(workspaceUser.role || 'brand_owner')} · ${titleCase(workspaceUser.plan || 'free')} plan`, titleCase(workspaceUser.status || 'active'), {
        id: recordId(workspaceUser),
        kind: 'user',
        href: '/dashboard/team',
        editHref: '/dashboard/team',
        editAction: `/admin/users/${recordId(workspaceUser)}/status`,
        editMethod: 'post',
        editFields: [
          { name: 'status', label: 'Status', type: 'select', value: workspaceUser.status || 'active', options: ['active', 'suspended', 'pending'] }
        ],
        details: {
          Name: workspaceUser.name,
          Email: workspaceUser.email,
          Role: titleCase(workspaceUser.role),
          Plan: titleCase(workspaceUser.plan),
          Status: titleCase(workspaceUser.status),
          Verified: workspaceUser.isVerified ? 'Yes' : 'No',
          'Created at': workspaceUser.createdAt ? formatDateTime(workspaceUser.createdAt) : ''
        }
      }))
    : [];
  const workspaceUserCards = adminUserCards.length ? adminUserCards : [ownerUserCard, ...teamCards];

  const subscriptionCards = subscriptions.map((subscription) => card(
    `${titleCase(subscription.plan)} subscription`,
    `${titleCase(subscription.provider || 'manual')} · ${subscription.currentPeriodEnd ? `renews ${formatDate(subscription.currentPeriodEnd)}` : 'period not set'}`,
    titleCase(subscription.status || 'active'),
    {
      id: recordId(subscription),
      kind: 'subscription',
      href: '/dashboard/billing',
      editHref: '/dashboard/billing',
      details: {
        Plan: titleCase(subscription.plan),
        Provider: titleCase(subscription.provider),
        Status: titleCase(subscription.status),
        'Current period start': subscription.currentPeriodStart ? formatDateTime(subscription.currentPeriodStart) : '',
        'Current period end': subscription.currentPeriodEnd ? formatDateTime(subscription.currentPeriodEnd) : '',
        'Cancel at period end': subscription.cancelAtPeriodEnd ? 'Yes' : 'No',
        'Updated at': subscription.updatedAt ? formatDateTime(subscription.updatedAt) : ''
      }
    }
  ));
  const paymentCards = payments.map((payment) => card(
    `${payment.currency || 'USD'} ${Number(payment.amount || 0).toLocaleString()}`,
    `${titleCase(payment.provider || 'payment')} · ${payment.reference || 'no reference'} · ${formatDate(payment.createdAt)}`,
    titleCase(payment.status || 'pending'),
    {
      id: recordId(payment),
      kind: 'payment',
      href: '/dashboard/billing',
      editHref: '/dashboard/billing',
      actions: payment.status !== 'paid' && user.role === 'super_admin'
        ? [{ label: 'Mark paid', action: `/admin/payments/${recordId(payment)}/mark-paid`, method: 'post', kind: 'billing' }]
        : [],
      details: {
        Provider: titleCase(payment.provider),
        Amount: Number(payment.amount || 0).toLocaleString(),
        Currency: payment.currency,
        Status: titleCase(payment.status),
        Reference: payment.reference,
        Metadata: payment.metadata,
        'Created at': payment.createdAt ? formatDateTime(payment.createdAt) : ''
      }
    }
  ));
  const templateCards = videoTemplates.map((template) => card(
    template.name,
    `${titleCase(template.category)} · ${template.aspectRatio} · ${template.durationSeconds || 0}s · ${(template.scenes || []).length} scene${(template.scenes || []).length === 1 ? '' : 's'}`,
    titleCase(template.status || 'active'),
    {
      id: recordId(template),
      kind: 'video_template',
      href: '/dashboard/video-system',
      editHref: '/dashboard/video-system',
      mediaUrl: template.previewUrl || '',
      mediaType: mediaTypeFromRecord({ fileUrl: template.previewUrl }, 'video'),
      details: {
        Category: titleCase(template.category),
        'Aspect ratio': template.aspectRatio,
        Duration: `${template.durationSeconds || 0}s`,
        Status: titleCase(template.status),
        'Preview URL': template.previewUrl,
        Scenes: (template.scenes || []).map((scene) => [scene.name, `${scene.durationSeconds}s`, scene.layout, listPreview(scene.requiredFields, 8)].filter(Boolean).join(' | ')),
        'Updated at': template.updatedAt ? formatDateTime(template.updatedAt) : ''
      }
    }
  ));
  const videoRenderCards = videoRenders.map((render) => card(
    render.template?.name || render.inputData?.headline || 'Template render',
    `${render.brand?.name || 'Brand'} · ${render.outputUrl ? 'output ready' : 'no output saved'} · ${Number(render.costCredits || 0)} credits`,
    titleCase(render.status || 'queued'),
    {
      id: recordId(render),
      kind: 'video_render',
      href: '/dashboard/video-system',
      editHref: '/dashboard/video-system',
      mediaUrl: render.outputUrl || '',
      mediaType: render.outputUrl ? 'video' : '',
      details: {
        Brand: render.brand?.name || 'Brand',
        Template: render.template?.name || '',
        Status: titleCase(render.status),
        'Output URL': render.outputUrl,
        'Cloudinary ID': render.cloudinaryPublicId,
        Credits: render.costCredits,
        Error: render.errorMessage,
        'Input data': render.inputData,
        'Updated at': render.updatedAt ? formatDateTime(render.updatedAt) : ''
      }
    }
  ));
  const avatarCards = avatarProfiles.map((avatar) => card(
    avatar.name || 'Avatar profile',
    `${avatar.brand?.name || 'Brand'} · ${avatar.provider || 'provider pending'} · consent ${avatar.ownershipConfirmed ? 'confirmed' : 'not confirmed'}`,
    titleCase(avatar.status || 'draft'),
    {
      id: recordId(avatar),
      kind: 'avatar_profile',
      href: '/dashboard/avatar-video',
      editHref: '/dashboard/avatar-video',
      mediaUrl: mediaUrlFromRecord(avatar.sourceMedia),
      mediaType: mediaTypeFromRecord(avatar.sourceMedia),
      details: {
        Brand: avatar.brand?.name || 'Brand',
        Provider: avatar.provider,
        'Provider avatar ID': avatar.providerAvatarId,
        Status: titleCase(avatar.status),
        'Ownership confirmed': avatar.ownershipConfirmed ? 'Yes' : 'No',
        'Allowed use': titleCase(avatar.allowedUse),
        'Consent version': avatar.consentVersion,
        'Consented at': avatar.consentedAt ? formatDateTime(avatar.consentedAt) : '',
        'Updated at': avatar.updatedAt ? formatDateTime(avatar.updatedAt) : ''
      }
    }
  ));
  const apiLogCards = apiLogs.map((log) => card(
    `${titleCase(log.provider)} ${titleCase(log.action)}`,
    `${log.message || 'API request'} · ${log.statusCode || 'no status code'} · ${timeAgo(log.createdAt)}`,
    titleCase(log.status || 'success'),
    {
      id: recordId(log),
      kind: 'api_log',
      href: '/dashboard/admin',
      editHref: '/dashboard/admin',
      details: {
        Provider: titleCase(log.provider),
        Action: titleCase(log.action),
        Status: titleCase(log.status),
        'Status code': log.statusCode,
        Message: log.message,
        'Created at': log.createdAt ? formatDateTime(log.createdAt) : ''
      }
    }
  ));
  const auditLogCards = auditLogs.map((log) => card(
    titleCase(log.action || 'Audit event'),
    `${log.entityType || 'Workspace'}${log.ipAddress ? ` · ${log.ipAddress}` : ''} · ${timeAgo(log.createdAt)}`,
    'Audit',
    {
      id: recordId(log),
      kind: 'audit_log',
      href: '/dashboard/admin',
      editHref: '/dashboard/admin',
      details: {
        Action: titleCase(log.action),
        'Entity type': log.entityType,
        'Entity ID': log.entityId,
        IP: log.ipAddress,
        Metadata: log.metadata,
        'Created at': log.createdAt ? formatDateTime(log.createdAt) : ''
      }
    }
  ));
  const failedPostCards = failedPosts.map((post) => postCard(post, {
    description: `${postDescription(post)} · ${truncate(post.errorMessage || 'No error message saved', 72)}`
  }));
  const usageCards = (usageDashboard?.cards || []).map((usage) => card(
    titleCase(usage.limitName || usage.metric),
    usage.unlimited ? `${usage.used} used · unlimited on this plan` : `${usage.used} used of ${usage.limit}`,
    usage.warn ? 'Upgrade soon' : 'Usage',
    {
      kind: 'usage',
      href: '/dashboard/billing',
      editHref: '/dashboard/billing',
      details: {
        Metric: usage.metric,
        Used: usage.used,
        Limit: usage.unlimited ? 'Unlimited' : usage.limit,
        Percent: usage.unlimited ? 'Unlimited' : `${usage.percent}%`,
        Warning: usage.warn ? '80% or higher' : 'No'
      }
    }
  ));
  const billingCards = [...subscriptionCards, ...paymentCards, ...usageCards];
  const videoSystemCards = [...videoCards, ...videoRenderCards];
  const templateSystemCards = [...templateCards, ...videoRenderCards];
  const adminPlanCards = adminPlans.map((planRecord) => {
    const id = recordId(planRecord);
    const subscriptionCount = planSubscriptionCounts[String(id)] || 0;
    const price = Number(planRecord.price || 0);
    return card(
      planRecord.name || titleCase(planRecord.slug || 'Plan'),
      `${planRecord.currency || 'USD'} ${price.toFixed(price % 1 ? 2 : 0)} / ${planRecord.billingInterval || 'month'} · ${subscriptionCount} subscriber${subscriptionCount === 1 ? '' : 's'}`,
      planRecord.deletedAt ? 'Deleted' : planRecord.isActive ? 'Active' : 'Inactive',
      {
        id,
        kind: 'subscription_plan',
        href: '/dashboard/plans',
        editHref: `/dashboard/plans?mode=edit&id=${id}`,
        actionHref: `/dashboard/plans?view=${id}`,
        actionLabel: 'View plan',
        details: {
          Slug: planRecord.slug,
          Price: `${planRecord.currency || 'USD'} ${planRecord.price || 0}`,
          Interval: titleCase(planRecord.billingInterval || 'month'),
          Public: planRecord.isPublic ? 'Yes' : 'No',
          Popular: planRecord.isPopular ? 'Yes' : 'No',
          'Sort order': planRecord.sortOrder,
          'Queue priority': planRecord.queuePriority,
          Subscriptions: subscriptionCount
        }
      }
    );
  });
  const planManagementCard = card('Subscription plan management', 'Create, edit, duplicate, reorder, activate, deactivate, and preview dynamic plans inside this dashboard page.', 'Plans', {
    kind: 'admin_plan_management',
    href: '/dashboard/plans',
    editHref: '/dashboard/plans',
    actionHref: '/dashboard/plans',
    actionLabel: 'Open plans',
    details: { Source: 'SubscriptionPlan database', Access: 'Superadmin, Billing Admin, or plans.view permission', Sync: 'Landing, signup, checkout, billing, limits, and feature gates' }
  });
  const adminCards = [
    planManagementCard,
    ...adminPlanCards,
    ...workspaceUserCards,
    ...paymentCards,
    ...failedPostCards,
    ...apiLogCards,
    ...auditLogCards
  ];
  const socialAlertCards = socialAccounts
    .filter((account) => ['expired', 'needs_reconnect', 'failed', 'disconnected'].includes(account.status))
    .map((account) => card(account.accountName, tokenStatusDescription(account), titleCase(account.status), {
      id: recordId(account), kind: 'social_account', href: '/dashboard/social', editHref: '/dashboard/social',
      details: { Brand: account.brand?.name || '', Platform: titleCase(account.platform), Status: titleCase(account.status), 'Token expires': account.tokenExpiresAt ? formatDateTime(account.tokenExpiresAt) : '', 'Last sync': account.lastSyncAt ? formatDateTime(account.lastSyncAt) : '' }
    }));
  const securityCards = [
    card('Account status', `${user.email || userName} · ${titleCase(user.status || 'active')} · verified ${user.isVerified ? 'yes' : 'no'}`, titleCase(user.role || 'owner'), {
      kind: 'account', href: '/dashboard/settings', editHref: '/dashboard/settings', details: { Name: userName, Email: user.email, Role: titleCase(user.role || 'owner'), Plan: planName, Verified: user.isVerified ? 'Yes' : 'No', Status: titleCase(user.status || 'active') }
    }),
    ...socialAlertCards,
    ...auditLogCards.slice(0, 4)
  ];
  const settingCards = [
    card('Profile', `${userName} · ${user.email || 'no email'} · ${planName} plan`, titleCase(user.status || 'active'), {
      kind: 'profile', href: '/dashboard/settings', editHref: '/dashboard/settings', details: { Name: userName, Email: user.email, Plan: planName, Status: titleCase(user.status || 'active') }
    }),
    ...brandCards
  ];
  const nextActionCard = !brands.length
    ? card('Next best action', 'Create your first Brand Brain so every generator can use real business context.', 'Setup', { kind: 'next_action', href: '/dashboard/brand-brain', editHref: '/dashboard/brand-brain' })
    : !connectedAccounts
      ? card('Next best action', 'Connect at least one social channel so generated posts can publish from the dashboard.', 'Connect', { kind: 'next_action', href: '/dashboard/social', editHref: '/dashboard/social' })
      : !recentPosts.length
        ? card('Next best action', 'Create your first real post from the full composer or AI Generator.', 'Create', { kind: 'next_action', href: '/dashboard/quick-create', editHref: '/dashboard/quick-create' })
        : scheduledCount
          ? card('Next best action', `${scheduledCount} scheduled post${scheduledCount === 1 ? '' : 's'} are ready on the live calendar.`, 'Calendar', { kind: 'next_action', href: '/dashboard/calendar', editHref: '/dashboard/calendar' })
          : card('Next best action', `${draftPosts} draft post${draftPosts === 1 ? '' : 's'} can be edited, scheduled or published.`, 'Drafts', { kind: 'next_action', href: '/dashboard/content-library', editHref: '/dashboard/content-library' });
  const handoffCards = brands.map((brand) => {
    const targetCount = socialAccounts.filter((account) => String(account.brand?._id || account.brand) === String(brand._id)).length;
    return card(
      brand.name,
      `${autoPostingSummary(brand)} · ${targetCount} connected target${targetCount === 1 ? '' : 's'}`,
      brand.autoPosting?.enabled ? 'Ready' : 'Needs setup',
      {
        id: recordId(brand),
        kind: 'auto_handoff',
        href: '/dashboard/approvals',
        editHref: '/dashboard/brand-brain',
        details: {
          Brand: brand.name,
          'Auto posting': autoPostingSummary(brand),
          'Connected targets': targetCount,
          'Preferred slots': brand.autoPosting?.preferredSlots,
          'Media mix': brand.autoPosting?.mediaMix,
          'Customer goal': brand.autoPosting?.customerGoal,
          'Strength target': brand.autoPosting?.strengthTarget
        }
      }
    );
  });
  const whatsappPostCards = recentPosts
    .filter((post) => post.platform === 'whatsapp')
    .map((post) => postCard(post));

  return {
    generatedAt: new Date().toISOString(),
    timeZone: DASHBOARD_TIME_ZONE,
    options: {
      brands: brands.map((brand) => ({
        id: brand._id.toString(),
        name: brand.name,
        tone: brand.tone || '',
        audience: brand.targetAudience || '',
        preferredCta: brand.preferredCta || ''
      })),
      brandRecords: brands.map(brandRecord),
      socialAccounts: socialAccounts.map((account) => ({
        id: account._id.toString(),
        brandId: account.brand?._id?.toString() || '',
        brandName: account.brand?.name || '',
        platform: account.platform,
        accountName: account.accountName,
        accountId: account.accountId || '',
        permissions: account.permissions || [],
        status: account.status,
        lastSyncAt: account.lastSyncAt,
        tokenExpiresAt: account.tokenExpiresAt
      })),
      media: media.map((asset) => ({
        id: asset._id.toString(),
        brandId: asset.brand?._id?.toString() || '',
        brandName: asset.brand?.name || '',
        fileName: asset.fileName,
        fileType: asset.fileType,
        mimeType: asset.mimeType || '',
        fileUrl: asset.fileUrl,
        consentStatus: asset.consentStatus
      })),
      teamMembers: teamMembers.map((member) => ({
        id: member._id.toString(),
        brandId: member.brand?._id?.toString() || '',
        brandName: member.brand?.name || '',
        name: member.name || '',
        email: member.email || '',
        role: member.role || '',
        permissions: member.permissions || [],
        status: member.status || ''
      })),
      avatarProfiles: avatarProfiles.map((avatar) => ({
        id: avatar._id.toString(),
        brandId: avatar.brand?._id?.toString() || '',
        brandName: avatar.brand?.name || '',
        name: avatar.name || '',
        provider: avatar.provider || '',
        status: avatar.status || '',
        ownershipConfirmed: Boolean(avatar.ownershipConfirmed)
      })),
      adminPlans: adminPlans.map((planRecord) => ({
        id: recordId(planRecord),
        name: planRecord.name || '',
        slug: planRecord.slug || '',
        description: planRecord.description || '',
        price: Number(planRecord.price || 0),
        currency: planRecord.currency || 'USD',
        billingInterval: planRecord.billingInterval || 'month',
        trialDays: Number(planRecord.trialDays || 0),
        isActive: Boolean(planRecord.isActive),
        isPublic: Boolean(planRecord.isPublic),
        isPopular: Boolean(planRecord.isPopular),
        deletedAt: planRecord.deletedAt || null,
        sortOrder: Number(planRecord.sortOrder || 100),
        queuePriority: Number(planRecord.queuePriority || 5),
        featureList: planRecord.featureList || [],
        limits: planRecord.limits || {},
        features: planRecord.features || {},
        aiConfig: planRecord.aiConfig || {},
        paymentProviderPlanId: planRecord.paymentProviderPlanId || '',
        taxBehavior: planRecord.taxBehavior || '',
        metadata: planRecord.metadata || {},
        subscriptionCount: planSubscriptionCounts[String(recordId(planRecord))] || 0
      })),
      publicPricingPlans: publicPricingPlans.map((planRecord) => ({
        id: planRecord.id || planRecord.slug,
        name: planRecord.name || '',
        slug: planRecord.slug || '',
        description: planRecord.description || '',
        price: Number(planRecord.price || 0),
        priceLabel: planRecord.priceLabel || '',
        intervalLabel: planRecord.intervalLabel || '',
        billingInterval: planRecord.billingInterval || '',
        isTrial: Boolean(planRecord.isTrial),
        isPopular: Boolean(planRecord.isPopular),
        checkoutUrl: planRecord.checkoutUrl || `/billing/checkout/${encodeURIComponent(planRecord.slug || '')}`,
        featureList: planRecord.featureList || [],
        limitList: planRecord.limitList || []
      })),
      planSubscriptionCounts,
      calendar: calendarMonthData
    },
    user: {
      name: userName,
      firstName: userName.split(/\s+/)[0],
      initials: initials(userName).toUpperCase(),
      role: titleCase(user.role || 'brand_owner'),
      plan: planName,
      planSlug: plan
    },
    workspace: {
      name: primaryBrand?.name || 'Brand Workspace',
      subtitle: `${planName} plan · ${brands.length} active ${brands.length === 1 ? 'brand' : 'brands'}`,
      primaryBrandName: primaryBrand?.name || 'Your first brand'
    },
    currentPlan: currentPlan ? plainPlan(currentPlan) : null,
    usageDashboard,
    featureAccess: normalizedFeatureAccess,
    roleAccess: {
      ...normalizedFeatureAccess.capabilities,
      allowedPages: normalizedFeatureAccess.roleAllowedPages,
      unlockedPages: normalizedFeatureAccess.unlockedPages,
      lockedPages: normalizedFeatureAccess.lockedPages,
      visiblePages: normalizedFeatureAccess.visiblePages,
      pageLocks: normalizedFeatureAccess.pageLocks,
      planSlug: normalizedFeatureAccess.planSlug,
      planName: normalizedFeatureAccess.planName
    },
    nav: {
      brands: brands.length,
      content: compactNumber(sum(Object.values(postTypes))),
      campaigns: campaigns.length,
      drafts: draftPosts,
      templates: videoTemplates.length + videoRenders.length,
      images: imageCount || mediaTotal,
      videos: videoJobTotal + videoMediaCount,
      scheduled: scheduledCount,
      handoff: brands.filter((brand) => brand.autoPosting?.enabled).length || brands.length,
      social: socialAccounts.length,
      approvals: pendingApprovals,
      team: teamMembers.length,
      users: workspaceUserCards.length,
      avatars: avatarProfiles.length,
      plan: planName,
      unread: unreadCount
    },
    pages: {
      overview: {
        stats: [
          [compactNumber(activeCampaigns), 'Active campaigns', `${campaignStatus.draft || 0} draft campaigns`],
          [compactNumber(generatedAssets), 'Generated assets', 'Posts, media and video jobs'],
          [compactNumber(pendingApprovals), 'Pending approvals', 'Client review queue'],
          [compactNumber(creditUsage), 'Credit usage', 'Estimated AI jobs']
        ],
        cards: [
          nextActionCard,
          card('Workspace focus', brands.length ? `${primaryBrand.name} is the active workspace feeding campaign and post generation.` : 'No active brand yet. Create Brand Brain data to unlock real generation context.', brands.length ? 'Brand' : 'Start'),
          card('Publishing queue', `${scheduledCount} scheduled, ${publishedCount} published and ${failedCount} failed posts are tracked.`, scheduledCount ? 'Live' : 'Queue'),
          card('Connected social', `${connectedAccounts} connected account${connectedAccounts === 1 ? '' : 's'} across ${connectedPlatforms || 0} platform${connectedPlatforms === 1 ? '' : 's'}.`, connectedAccounts ? 'OAuth' : 'Connect'),
          card('Brand memory', `${productCount} products, ${offerCount} offers and ${ruleCount} brand rules are saved.`, 'Brain'),
          card('Video workload', `${videoJobTotal} AI video job${videoJobTotal === 1 ? '' : 's'} with ${compactNumber(sum(videoJobs.map((job) => job.costCredits)))} video credits used.`, 'Video'),
          card('Unread alerts', `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'} need attention.`, unreadCount ? 'Now' : 'Clear')
        ],
        rows: recentPostRows
      },
      'quick-create': {
        stats: [
          [compactNumber(brands.length), 'Ready brands', 'Brand Brain context'],
          [compactNumber(campaigns.length), 'Campaigns', 'Planning source'],
          [compactNumber(socialAccounts.length), 'Social accounts', 'Publishing targets'],
          [compactNumber(mediaTotal), 'Media assets', 'Creative source']
        ],
        cards: [
          card('Use Brand Brain', `${primaryBrand?.name || 'Your saved brand'} supplies tone, offers, audience and CTA rules automatically.`, 'Context'),
          card('Generate from campaigns', `${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'} can feed captions, images, videos and schedules.`, 'Campaign'),
          card('Post everywhere ready', `${socialAccounts.length} connected account${socialAccounts.length === 1 ? '' : 's'} can be selected for publishing.`, 'Targets')
        ],
        rows: recentPostRows,
        form: true
      },
      roles: {
        stats: [
          [compactNumber(teamMembers.length), 'Team members', 'Invited or active'],
          [user.role ? titleCase(user.role) : 'Owner', 'Your role', 'Current access'],
          [compactNumber(teamMembers.filter((member) => member.status === 'invited').length), 'Pending invites', 'Team'],
          [compactNumber(teamMembers.filter((member) => member.status === 'active').length), 'Active members', 'Team']
        ],
        cards: [...roleDashboardCards, ...teamCards],
        rows: [...roleDashboardCards, ...teamCards],
        tableRows: [...roleDashboardCards, ...teamCards],
        form: true
      },
      users: {
        stats: [
          [compactNumber(workspaceUserCards.length), 'Users', 'Role-aware dashboard access'],
          [titleCase(user.role || 'brand_owner'), 'Your role', 'Active dashboard profile'],
          [compactNumber(teamMembers.filter((member) => member.status === 'active').length), 'Active team users', 'Accepted invitations'],
          [compactNumber(teamMembers.filter((member) => member.status === 'invited').length), 'Pending users', 'Invites']
        ],
        cards: workspaceUserCards,
        rows: workspaceUserCards,
        tableRows: workspaceUserCards,
        form: true
      },
      team: {
        stats: [
          [compactNumber(teamMembers.length), 'Team members', 'Invited or active'],
          [compactNumber(teamMembers.filter((member) => member.status === 'invited').length), 'Pending invites', 'Awaiting accept'],
          [compactNumber(teamMembers.filter((member) => member.status === 'active').length), 'Active members', 'Accepted'],
          [user.role ? titleCase(user.role) : 'Owner', 'Your role', 'Current access']
        ],
        cards: teamCards,
        rows: teamCards,
        tableRows: teamCards,
        form: true
      },
      'brand-brain': {
        stats: [
          [compactNumber(brands.length), 'Brand kits', 'Saved profiles'],
          [compactNumber(productCount), 'Products', 'Offer library'],
          [compactNumber(ruleCount), 'Tone rules', 'Voice memory'],
          [compactNumber(proofCount), 'Proof points', 'Testimonials']
        ],
        cards: brandCards,
        rows: brandCards,
        tableRows: brandCards,
        form: true
      },
      'content-library': {
        stats: [
          [compactNumber(sum(Object.values(postStatus))), 'Total posts', 'Database'],
          [compactNumber(draftPosts), 'Drafts', 'Editable'],
          [compactNumber(scheduledCount), 'Scheduled', 'Calendar'],
          [compactNumber(failedCount), 'Failed', 'Needs retry']
        ],
        cards: recentPostCards,
        rows: recentPostRows,
        tableRows: recentPostRows,
        form: true
      },
      'content-generator': {
        stats: [
          [compactNumber(postTypes.text || 0), 'Text posts', 'Captions and copy'],
          [compactNumber(postTypes.image || 0), 'Image posts', 'Visual drafts'],
          [compactNumber(postTypes.carousel || 0), 'Carousels', 'Slide content'],
          [compactNumber((postTypes.video || 0) + (postTypes.avatar_video || 0)), 'Video posts', 'Reels and shorts']
        ],
        cards: recentPostCards,
        rows: recentPostRows,
        tableRows: recentPostRows,
        form: true
      },
      'ai-generator': {
        stats: [
          [compactNumber(brands.length), 'Brands', 'AI context'],
          [compactNumber(draftPosts), 'Drafts', 'Generated posts'],
          [compactNumber(campaigns.length), 'Campaigns', 'Planning'],
          [compactNumber(mediaTotal), 'Media assets', 'Optional source']
        ],
        cards: [...brandCards, ...recentPostCards, ...campaignCards].slice(0, 12),
        rows: recentPostRows,
        tableRows: recentPostRows,
        form: true
      },
      campaigns: {
        stats: [
          [compactNumber(activeCampaigns), 'Active campaigns', 'Running'],
          [compactNumber(campaignStatus.draft || 0), 'Draft campaigns', 'Planning'],
          [compactNumber(campaignStatus.completed || 0), 'Completed', 'Finished'],
          [compactNumber(campaigns.length), 'Total loaded', 'Workspace']
        ],
        cards: campaignCards,
        rows: campaignCards,
        tableRows: campaignCards,
        form: true
      },
      templates: {
        stats: [
          [compactNumber(videoTemplates.length), 'Video templates', 'Saved'],
          [compactNumber(videoRenders.length), 'Template renders', 'Recent'],
          [compactNumber(campaigns.length), 'Campaign bases', 'Reusable'],
          [compactNumber(brands.length), 'Brand variants', 'Context aware']
        ],
        cards: templateSystemCards,
        rows: templateSystemCards,
        tableRows: templateSystemCards,
        form: true
      },
      'image-workflows': {
        stats: [
          [compactNumber(imageCount), 'Images', 'Media library'],
          [compactNumber(postTypes.carousel || 0), 'Carousels', 'Post format'],
          [compactNumber(mediaTotal), 'Assets', 'Uploaded/generated'],
          [compactNumber(brands.length), 'Brand kits', 'Visual rules']
        ],
        cards: mediaCards.filter((item) => String(item.tag || '').toLowerCase() !== 'video'),
        tableRows: mediaCards,
        form: true
      },
      media: {
        stats: [
          [compactNumber(mediaTotal), 'Media assets', 'Library'],
          [compactNumber(imageCount), 'Images', 'Creative'],
          [compactNumber(videoMediaCount), 'Videos', 'Source files'],
          [compactNumber(brands.length), 'Brands', 'Linked']
        ],
        cards: mediaCards,
        rows: mediaCards,
        tableRows: mediaCards,
        form: true
      },
      'growth-studio': {
        stats: [
          [compactNumber(growthAssets.length), 'Growth assets', 'Saved'],
          [compactNumber(campaigns.length), 'Campaigns', 'Inputs'],
          [compactNumber(videoJobTotal), 'Storyboards', 'Video jobs'],
          [compactNumber(brands.length), 'Brands', 'Auditable']
        ],
        cards: growthCards,
        rows: growthCards,
        tableRows: growthCards,
        form: true
      },
      'video-system': {
        stats: [
          [compactNumber(videoJobTotal), 'Video jobs', 'AI generation'],
          [compactNumber(videoStatus.ready || 0), 'Ready videos', 'Exports'],
          [compactNumber(videoStatus.failed || 0), 'Failed videos', 'Needs retry'],
          [compactNumber(videoMediaCount), 'Video files', 'Media library']
        ],
        cards: videoSystemCards,
        rows: videoSystemCards,
        tableRows: videoSystemCards,
        form: true
      },
      'avatar-video': {
        stats: [
          [compactNumber(videoStatus.ready || 0), 'Ready', 'Generated'],
          [compactNumber(videoStatus.generating || 0), 'Generating', 'In progress'],
          [compactNumber(videoStatus.failed || 0), 'Failed', 'Retry'],
          [planName, 'Plan', 'Current']
        ],
        cards: avatarCards,
        rows: avatarCards,
        tableRows: avatarCards,
        form: true
      },
      'avatar-consent': {
        stats: [
          [compactNumber(avatarProfiles.length), 'Avatar profiles', 'Saved'],
          [compactNumber(avatarProfiles.filter((avatar) => avatar.ownershipConfirmed).length), 'Consent confirmed', 'Usable'],
          [compactNumber(avatarProfiles.filter((avatar) => avatar.status === 'ready').length), 'Ready avatars', 'Provider'],
          [compactNumber(media.filter((asset) => ['image', 'video'].includes(asset.fileType)).length), 'Source media', 'Eligible']
        ],
        cards: avatarCards,
        rows: avatarCards,
        tableRows: avatarCards,
        form: true
      },
      whatsapp: {
        stats: [
          [compactNumber(postPlatforms.whatsapp || 0), 'WhatsApp posts', 'Ready copy'],
          [compactNumber(socialAccounts.filter((account) => account.platform === 'whatsapp').length), 'WhatsApp accounts', 'Connected'],
          [compactNumber(offerCount), 'Local offers', 'Saved'],
          [compactNumber(brands.length), 'Brands', 'Local context']
        ],
        cards: [...whatsappPostCards, ...socialCards.filter((item) => String(item.description || '').toLowerCase().includes('whatsapp'))],
        rows: whatsappPostCards,
        tableRows: whatsappPostCards,
        form: true
      },
      calendar: {
        stats: [
          [compactNumber(scheduledCount), 'Scheduled posts', 'Queue'],
          [compactNumber(connectedPlatforms), 'Channels', 'Active'],
          [compactNumber(draftPosts), 'Draft slots', 'Open'],
          [compactNumber(failedCount), 'Retry items', 'Failed posts']
        ],
        cards: scheduledPostCards,
        rows: scheduledRows,
        tableRows: scheduledRows,
        form: true
      },
      'auto-handoff': {
        stats: [
          [compactNumber(handoffCards.length), 'Brands ready', 'Brand Brain'],
          [compactNumber(brands.filter((brand) => brand.autoPosting?.enabled).length), 'Auto-enabled', 'Saved settings'],
          [compactNumber(socialAccounts.length), 'Targets', 'Connected accounts'],
          [compactNumber(scheduledCount), 'Scheduled', 'Queue']
        ],
        cards: handoffCards,
        rows: handoffCards,
        tableRows: handoffCards,
        form: true
      },
      social: {
        stats: [
          [compactNumber(socialAccounts.length), 'Connected accounts', 'OAuth'],
          [compactNumber(connectedPlatforms), 'Platforms', 'Ready'],
          [compactNumber((socialStatus.expired || 0) + (socialStatus.needs_reconnect || 0)), 'Token alerts', 'Refresh'],
          [publishedCount || failedCount ? `${Math.round((publishedCount / Math.max(publishedCount + failedCount, 1)) * 100)}%` : '0%', 'Publish success', 'All time']
        ],
        cards: socialCards,
        tableRows: socialCards,
        form: true
      },
      approvals: {
        stats: [
          [compactNumber(pendingApprovals), 'Pending', 'Review queue'],
          [compactNumber(approvalStatus.approved || 0), 'Approved', 'Ready'],
          [compactNumber(approvalStatus.changes_requested || 0), 'Changes', 'Requested'],
          [compactNumber(scheduledCount), 'Scheduled', 'After approval']
        ],
        cards: approvalCards,
        rows: approvalCards,
        tableRows: approvalCards,
        form: true
      },
      analytics: {
        stats: [
          [compactNumber(analyticsTotals.reach), 'Reach', 'Synced analytics'],
          [analyticsTotals.engagementRate ? `${analyticsTotals.engagementRate.toFixed(1)}%` : '0%', 'Engagement', 'Average'],
          [compactNumber(analyticsTotals.clicks), 'Clicks', 'Tracked'],
          [titleCase(topPlatform), 'Top format', 'By posts']
        ],
        cards: [
          card('Views', `${compactNumber(analyticsTotals.views)} total views recorded from connected analytics.`, 'Views'),
          card('Likes', `${compactNumber(analyticsTotals.likes)} likes across synced posts.`, 'Likes'),
          card('Comments', `${compactNumber(analyticsTotals.comments)} comments captured.`, 'Comments'),
          card('Shares', `${compactNumber(analyticsTotals.shares)} shares tracked.`, 'Shares'),
          card('Clicks', `${compactNumber(analyticsTotals.clicks)} click actions recorded.`, 'Clicks'),
          card('Reach', `${compactNumber(analyticsTotals.reach)} people reached across synced accounts.`, 'Reach')
        ]
      },
      notifications: {
        stats: [
          [compactNumber(unreadCount), 'Unread', 'Needs attention'],
          [compactNumber(notifications.length), 'Recent alerts', 'Loaded'],
          [compactNumber(failedCount), 'Failed posts', 'Action items'],
          [compactNumber(pendingApprovals), 'Approvals', 'Review queue']
        ],
        cards: notificationCards,
        rows: notificationCards,
        tableRows: notificationCards,
        form: true
      },
      admin: {
        stats: [
          [compactNumber(brands.length), 'Brands', 'Workspace'],
          [compactNumber(sum(Object.values(postStatus))), 'Posts', 'Content'],
          [compactNumber(failedCount), 'Failed posts', 'Retry'],
          [compactNumber(videoJobTotal), 'Video jobs', 'Queue']
        ],
        cards: adminCards,
        rows: adminCards,
        tableRows: adminCards,
        form: true
      },
      billing: {
        stats: [
          [planName, 'Current plan', user.status || 'Active'],
          [compactNumber(creditUsage), 'Credits used', 'Estimated'],
          [compactNumber(payments.length), 'Payments', 'Recorded'],
          [compactNumber(subscriptions.length), 'Subscriptions', 'Recorded']
        ],
        cards: billingCards,
        rows: billingCards,
        tableRows: billingCards,
        form: true
      },
      security: {
        stats: [
          [user.isVerified ? 'Yes' : 'No', 'Email verified', 'Account'],
          [user.role ? titleCase(user.role) : 'RBAC', 'Role', 'Active'],
          [compactNumber(socialAlertCards.length), 'Token alerts', 'Social'],
          [compactNumber(auditLogs.length), 'Audit logs', 'Recent']
        ],
        cards: securityCards,
        rows: securityCards,
        tableRows: securityCards,
        form: true
      },
      integrations: {
        stats: [
          [compactNumber(connectedPlatforms), 'Providers', 'Connected'],
          [compactNumber(apiLogs.length), 'API logs', 'Recent'],
          [compactNumber(socialAccounts.length), 'OAuth accounts', 'Secure'],
          [connectedAccounts ? 'Live' : 'Setup', 'Status', 'Monitoring']
        ],
        cards: socialCards,
        rows: socialCards,
        tableRows: socialCards,
        form: true
      },
      settings: {
        stats: [
          [compactNumber(brands.length), 'Brands', 'Workspace'],
          [compactNumber(teamMembers.length + 1), 'Users', 'Current workspace'],
          [compactNumber(unreadCount), 'Alerts', 'Enabled'],
          [planName, 'Plan', 'Saved']
        ],
        cards: settingCards,
        rows: settingCards,
        tableRows: settingCards,
        form: true
      }
    }
  };
}

async function index(req, res, next) {
  try {
    const currentPlan = await getCurrentPlan(req.user);
    const featureAccess = buildFeatureAccess({ user: req.user, plan: currentPlan });
    const requestedPage = resolveDashboardPageForAccess({ page: req.params.page, featureAccess });
    const userId = req.user._id;
    const selectedCalendarMonth = parseMonthValue(req.query.month);
    const calendarStart = startOfMonth(selectedCalendarMonth);
    const calendarEnd = endOfMonth(selectedCalendarMonth);
    const shouldLoadPlans = canViewPlanManagement(req.user);

    await updateBrandPerformanceMemoryForOwner(userId);

    const [
      brands,
      campaigns,
      socialAccounts,
      approvals,
      recentPosts,
      scheduledPosts,
      media,
      videoJobs,
      unreadCount,
      postStatusRows,
      postTypeRows,
      postPlatformRows,
      socialStatusRows,
      campaignStatusRows,
      mediaTypeRows,
      videoStatusRows,
      approvalStatusRows,
      notifications,
      growthAssets,
      calendarPosts,
      teamMembers,
      subscriptions,
      payments,
      videoTemplates,
      videoRenders,
      avatarProfiles,
      apiLogs,
      auditLogs,
      failedPosts,
      allUsers,
      adminPlans,
      planCountRows,
      publicPricingPlans
    ] = await Promise.all([
      Brand.find({ owner: userId, status: 'active' }).sort({ updatedAt: -1 }).limit(12).lean(),
      Campaign.find({ createdBy: userId, status: { $ne: 'archived' } }).populate('brand').sort({ updatedAt: -1 }).limit(12).lean(),
      SocialAccount.find({ owner: userId }).populate('brand').sort({ updatedAt: -1 }).limit(16).lean(),
      Approval.find({ requestedBy: userId }).populate({ path: 'post', populate: [{ path: 'brand' }, { path: 'media' }, { path: 'targetAccounts' }] }).sort({ updatedAt: -1 }).limit(12).lean(),
      Post.find({ createdBy: userId }).populate('brand').populate('media').populate('targetAccounts').sort({ updatedAt: -1 }).limit(12).lean(),
      Post.find({ createdBy: userId, status: 'scheduled' }).populate('brand').populate('media').populate('targetAccounts').sort({ scheduledAt: 1 }).limit(12).lean(),
      Media.find({ uploadedBy: userId }).populate('brand').sort({ updatedAt: -1 }).limit(80).lean(),
      AiVideoJob.find({ createdBy: userId }).populate('brand').sort({ updatedAt: -1 }).limit(12).lean(),
      Notification.countDocuments({ user: userId, readAt: null }),
      Post.aggregate([{ $match: { createdBy: userId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Post.aggregate([{ $match: { createdBy: userId } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
      Post.aggregate([{ $match: { createdBy: userId } }, { $group: { _id: '$platform', count: { $sum: 1 } } }]),
      SocialAccount.aggregate([{ $match: { owner: userId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Campaign.aggregate([{ $match: { createdBy: userId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Media.aggregate([{ $match: { uploadedBy: userId } }, { $group: { _id: '$fileType', count: { $sum: 1 } } }]),
      AiVideoJob.aggregate([{ $match: { createdBy: userId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Approval.aggregate([{ $match: { requestedBy: userId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(12).lean(),
      GrowthAsset.find({ owner: userId }).populate('brand').sort({ createdAt: -1 }).limit(12).lean(),
      Post.find({
        createdBy: userId,
        status: { $in: ['scheduled', 'publishing', 'published', 'failed', 'cancelled'] },
        $or: [
          { scheduledAt: { $gte: calendarStart, $lte: calendarEnd } },
          { publishedAt: { $gte: calendarStart, $lte: calendarEnd } },
          { scheduledAt: null, createdAt: { $gte: calendarStart, $lte: calendarEnd } }
        ]
      })
        .populate('brand')
        .populate('media')
        .populate('targetAccounts')
        .sort({ scheduledAt: 1, publishedAt: 1, createdAt: -1 })
        .limit(240)
        .lean(),
      TeamMember.find({ $or: [{ invitedBy: userId }, { user: userId }] }).populate('brand').populate('user').sort({ updatedAt: -1 }).limit(24).lean(),
      Subscription.find({ user: userId }).sort({ updatedAt: -1 }).limit(6).lean(),
      Payment.find({ user: userId }).sort({ createdAt: -1 }).limit(12).lean(),
      VideoTemplate.find({ status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(12).lean(),
      VideoRender.find({ createdBy: userId }).populate('brand').populate('template').sort({ updatedAt: -1 }).limit(12).lean(),
      AvatarProfile.find({ owner: userId }).populate('brand').populate('sourceMedia').sort({ updatedAt: -1 }).limit(12).lean(),
      ApiLog.find({ user: userId }).sort({ createdAt: -1 }).limit(12).lean(),
      AuditLog.find({ user: userId }).sort({ createdAt: -1 }).limit(12).lean(),
      Post.find({ createdBy: userId, status: 'failed' }).populate('brand').populate('media').populate('targetAccounts').sort({ updatedAt: -1 }).limit(12).lean(),
      req.user.role === 'super_admin' ? User.find().sort({ createdAt: -1 }).limit(24).lean() : Promise.resolve([]),
      shouldLoadPlans ? SubscriptionPlan.find().sort({ sortOrder: 1, createdAt: 1 }).lean() : Promise.resolve([]),
      shouldLoadPlans ? Subscription.aggregate([{ $group: { _id: '$planRef', count: { $sum: 1 } } }]) : Promise.resolve([]),
      getPublicPricingCards()
    ]);

    const usageDashboard = await buildUsageDashboard(req.user);
    const planSubscriptionCounts = (planCountRows || []).reduce((map, row) => {
      map[String(row._id)] = row.count;
      return map;
    }, {});

    const brandIds = brands.map((brand) => brand._id);
    const [analyticsTotals = {}] = brandIds.length
      ? await Analytics.aggregate([
          { $match: { brand: { $in: brandIds } } },
          {
            $group: {
              _id: null,
              views: { $sum: '$views' },
              likes: { $sum: '$likes' },
              comments: { $sum: '$comments' },
              shares: { $sum: '$shares' },
              clicks: { $sum: '$clicks' },
              reach: { $sum: '$reach' },
              engagementRate: { $avg: '$engagementRate' }
            }
          }
        ])
      : [{}];

    const dashboardData = buildDashboardData({
      user: req.user,
      brands,
      campaigns,
      socialAccounts,
      approvals,
      recentPosts,
      scheduledPosts,
      media,
      videoJobs,
      unreadCount,
      postStatus: countMap(postStatusRows),
      postTypes: countMap(postTypeRows),
      postPlatforms: countMap(postPlatformRows),
      socialStatus: countMap(socialStatusRows),
      campaignStatus: countMap(campaignStatusRows),
      mediaTypes: countMap(mediaTypeRows),
      videoStatus: countMap(videoStatusRows),
      approvalStatus: countMap(approvalStatusRows),
      analyticsTotals,
      notifications,
      growthAssets,
      calendarMonthData: buildCalendarMonthData(selectedCalendarMonth, calendarPosts),
      teamMembers,
      subscriptions,
      payments,
      videoTemplates,
      videoRenders,
      avatarProfiles,
      apiLogs,
      auditLogs,
      failedPosts,
      allUsers,
      adminPlans,
      planSubscriptionCounts,
      currentPlan,
      featureAccess,
      usageDashboard,
      publicPricingPlans
    });
    dashboardData.initialPage = requestedPage;
    dashboardData.csrfToken = req.csrfToken ? req.csrfToken() : '';

    res.render('dashboard/experience', {
      title: requestedPage === 'overview' ? 'Dashboard' : titleCase(requestedPage.replace(/-/g, ' ')),
      layout: false,
      dashboardData,
      dashboardJson: scriptJson(dashboardData)
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { index };
