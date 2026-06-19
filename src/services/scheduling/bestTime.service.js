const PLATFORM_DEFAULT_SLOTS = {
  facebook: ['18:00', '20:00'],
  instagram: ['12:30', '19:00'],
  linkedin: ['09:00', '12:00'],
  tiktok: ['19:30', '21:00'],
  youtube: ['18:00', '20:00'],
  whatsapp: ['10:00', '17:30'],
  x: ['08:30', '18:00'],
  threads: ['12:00', '19:30'],
  pinterest: ['20:00'],
  google_business: ['09:00', '15:00']
};

function slotToTime(slot = '') {
  const value = String(slot || '').trim().toLowerCase();
  const explicit = value.match(/\b([01]?\d|2[0-3])(?::([0-5]\d))?\b/);
  if (explicit) return `${explicit[1].padStart(2, '0')}:${explicit[2] || '00'}`;
  if (value.includes('morning')) return '09:00';
  if (value.includes('lunch') || value.includes('noon')) return '12:30';
  if (value.includes('afternoon')) return '15:00';
  if (value.includes('evening')) return '18:30';
  if (value.includes('night')) return '20:30';
  return '';
}

function brandSlots(brand = {}, platform = 'facebook') {
  const preferred = Array.isArray(brand.autoPosting?.preferredSlots) ? brand.autoPosting.preferredSlots : [];
  const normalized = preferred.map(slotToTime).filter(Boolean);
  return normalized.length ? normalized : (PLATFORM_DEFAULT_SLOTS[platform] || PLATFORM_DEFAULT_SLOTS.facebook);
}

function nextLocalIsoDateTime({ date = new Date(), time = '18:00' } = {}) {
  const base = new Date(date);
  if (Number.isNaN(base.getTime())) base.setTime(Date.now());
  const [hour, minute] = String(time || '18:00').split(':').map((part) => Number(part || 0));
  base.setHours(hour || 0, minute || 0, 0, 0);
  if (base <= new Date()) base.setDate(base.getDate() + 1);
  return base.toISOString();
}

function suggestBestTimes({ brand = {}, platform = 'facebook', date = new Date(), limit = 3 } = {}) {
  const slots = brandSlots(brand, platform).slice(0, Math.max(1, Number(limit || 3)));
  return slots.map((time, index) => ({
    time,
    scheduledAt: nextLocalIsoDateTime({ date, time }),
    label: `${time} ${platform.replace(/_/g, ' ')}`,
    reason: index === 0 && Array.isArray(brand.autoPosting?.preferredSlots) && brand.autoPosting.preferredSlots.length
      ? 'From Brand Brain preferred slots'
      : `Default ${platform.replace(/_/g, ' ')} engagement window`
  }));
}

module.exports = { brandSlots, suggestBestTimes, slotToTime };
