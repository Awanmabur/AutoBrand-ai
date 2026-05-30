const { calculateBrandScore } = require('./brandScore.service');

function suggestContentPillars(brand = {}) {
  const base = ['Education', 'Proof', 'Behind the scenes', 'Offers', 'Community'];
  const industry = String(brand.industry || brand.businessType || '').toLowerCase();
  if (industry.includes('food')) return ['Menu highlights', 'Customer cravings', 'Behind the kitchen', 'Daily offers', 'Local community'];
  if (industry.includes('real estate')) return ['Listings', 'Buyer education', 'Neighborhood guides', 'Client proof', 'Market updates'];
  if (industry.includes('fitness')) return ['Training tips', 'Transformation proof', 'Motivation', 'Offer reminders', 'Community wins'];
  return base;
}

function suggestAudiencePainPoints(brand = {}) {
  if (brand.customerPainPoints?.length) return brand.customerPainPoints;
  return [
    'They are unsure which option is best for them.',
    'They do not want to waste money or time.',
    'They need proof before they trust a new provider.',
    'They want a simple next step.'
  ];
}

function suggestOffers(brand = {}) {
  const products = brand.products || [];
  const services = brand.services || [];
  const primary = products[0]?.name || services[0]?.name || brand.name || 'your service';
  return [
    `Intro offer for ${primary}`,
    `Limited-time bundle around ${primary}`,
    `Free consultation or audit for qualified leads`
  ];
}

function suggestDifferentiation(brand = {}) {
  const usp = brand.uniqueSellingPoint || brand.differentiationNotes;
  if (usp) return [usp];
  return [
    'Highlight speed, convenience, trust, proof, guarantee, and local expertise.',
    'Compare against alternatives by showing what customers get that competitors miss.'
  ];
}

function getMissingFieldSuggestions(brand = {}) {
  return calculateBrandScore(brand).suggestions;
}

module.exports = { getMissingFieldSuggestions, suggestAudiencePainPoints, suggestContentPillars, suggestDifferentiation, suggestOffers };
