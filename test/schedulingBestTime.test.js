const test = require('node:test');
const assert = require('node:assert/strict');
const { brandSlots, slotToTime, suggestBestTimes } = require('../src/services/scheduling/bestTime.service');

test('best-time suggestions prefer Brand Brain slots and normalize common labels', () => {
  const brand = { autoPosting: { preferredSlots: ['morning', 'evening'] } };

  assert.equal(slotToTime('night'), '20:30');
  assert.deepEqual(brandSlots(brand, 'instagram'), ['09:00', '18:30']);

  const suggestions = suggestBestTimes({
    brand,
    platform: 'instagram',
    date: new Date('2030-01-02T00:00:00Z'),
    limit: 2
  });

  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0].time, '09:00');
  assert.match(suggestions[0].reason, /Brand Brain/);
  assert.match(suggestions[0].label, /instagram/);
});

test('best-time suggestions fall back to platform defaults', () => {
  const suggestions = suggestBestTimes({ brand: {}, platform: 'whatsapp', date: new Date('2030-01-02T00:00:00Z'), limit: 1 });

  assert.equal(suggestions[0].time, '10:00');
  assert.match(suggestions[0].reason, /Default whatsapp/);
});
