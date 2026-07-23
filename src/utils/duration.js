const UNITS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000
};

function durationToMs(value, fallbackMs) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const multiplier = UNITS[match[2]];
  const result = amount * multiplier;
  return Number.isFinite(result) && result > 0 ? Math.floor(result) : fallbackMs;
}

module.exports = { durationToMs };
