const DEFAULT_TIME_ZONE = process.env.APP_TIME_ZONE || process.env.TIME_ZONE || 'Africa/Kampala';

function partsInTimeZone(date, timeZone = DEFAULT_TIME_ZONE) {
  const value = date instanceof Date ? date : new Date(date);
  const safe = Number.isNaN(value.getTime()) ? new Date() : value;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(safe).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
    return result;
  }, {});
  return parts;
}

function timeZoneOffsetMinutes(timeZone, date) {
  const parts = partsInTimeZone(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0);
  return (asUtc - date.getTime()) / 60000;
}

function zonedLocalTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0, timeZone = DEFAULT_TIME_ZONE }) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let offset = timeZoneOffsetMinutes(timeZone, new Date(localAsUtc));
  let result = localAsUtc - offset * 60000;
  offset = timeZoneOffsetMinutes(timeZone, new Date(result));
  result = localAsUtc - offset * 60000;
  return new Date(result);
}

function zonedDateForDayOffset({ date = new Date(), dayOffset = 0, hour = 0, minute = 0, second = 0, timeZone = DEFAULT_TIME_ZONE } = {}) {
  const base = partsInTimeZone(date, timeZone);
  const calendar = new Date(Date.UTC(base.year, base.month - 1, base.day + Number(dayOffset || 0)));
  return zonedLocalTimeToUtc({
    year: calendar.getUTCFullYear(),
    month: calendar.getUTCMonth() + 1,
    day: calendar.getUTCDate(),
    hour: Number(hour || 0),
    minute: Number(minute || 0),
    second: Number(second || 0),
    timeZone
  });
}

module.exports = {
  DEFAULT_TIME_ZONE,
  partsInTimeZone,
  timeZoneOffsetMinutes,
  zonedDateForDayOffset,
  zonedLocalTimeToUtc
};
