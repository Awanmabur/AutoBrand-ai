const test = require('node:test');
const assert = require('node:assert/strict');
const {
  adCopyPack,
  carouselIdeaGenerator,
  contentIdeas,
  contentPlanAsset,
  draftsFromGrowthAsset,
  hookGenerator,
  reelScriptGenerator,
  whatsappPromoPack
} = require('../src/services/growthStudioService');

const brand = {
  _id: 'brand-1',
  name: 'Kampala Coffee',
  businessType: 'Cafe',
  location: 'Kampala',
  targetAudience: 'busy professionals',
  preferredCta: 'Order ahead today.',
  offers: [{ title: 'lunch combo' }],
  products: [{ name: 'cold brew' }],
  preferredHashtags: ['#CoffeeUG']
};

test('growth studio generates the missing growth asset types', () => {
  const outputs = [
    contentIdeas(brand, 'sales'),
    hookGenerator(brand, 'sales'),
    reelScriptGenerator(brand, 'sales'),
    carouselIdeaGenerator(brand, 'sales'),
    contentPlanAsset(brand, 'sales', 'facebook, instagram', 7),
    whatsappPromoPack(brand, 'sales'),
    adCopyPack(brand, 'sales')
  ];

  for (const output of outputs) {
    assert.ok(output.title);
    assert.ok(output.sections.length);
    assert.ok(output.summary);
  }
  assert.equal(outputs[4].metadata.aiPlan.postIdeas.length, 7);
});

test('growth assets can be converted into draft posts', () => {
  const asset = {
    _id: 'asset-1',
    type: 'whatsapp_promo_pack',
    title: 'WhatsApp promos',
    summary: 'Promo pack',
    sections: [{ heading: 'Messages', items: ['Hi there', 'Quick reminder'] }]
  };

  const drafts = draftsFromGrowthAsset({ asset, brand, platforms: 'facebook, instagram' });

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].platform, 'whatsapp');
  assert.equal(drafts[0].type, 'whatsapp_message');
  assert.equal(drafts[0].platformMetadata.growthAsset, 'asset-1');
});
