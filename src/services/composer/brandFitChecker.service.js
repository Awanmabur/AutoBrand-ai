function normalizeWords(words = []) {
  return words.map((word) => String(word || '').trim().toLowerCase()).filter(Boolean);
}

function checkBrandFit(content = {}, brand = {}) {
  const caption = String(content.caption || '').toLowerCase();
  const blocked = normalizeWords([...(brand.bannedWords || []), ...(brand.blockedWords || [])]);
  const preferred = normalizeWords(brand.preferredWords || []);
  const pillars = normalizeWords(brand.contentPillars || []);
  const violations = blocked.filter((word) => word && caption.includes(word));
  const preferredHits = preferred.filter((word) => caption.includes(word));
  const pillarHits = pillars.filter((word) => caption.includes(word));
  let score = 80;
  score -= violations.length * 20;
  score += Math.min(10, preferredHits.length * 2);
  score += Math.min(10, pillarHits.length * 3);
  if (brand.toneOfVoice && !caption.includes(String(brand.toneOfVoice).toLowerCase().split(/[ ,]+/)[0])) score -= 3;
  return {
    score: Math.max(0, Math.min(100, score)),
    violations,
    preferredHits,
    pillarHits,
    offBrandWarning: violations.length ? `Blocked words detected: ${violations.join(', ')}` : ''
  };
}

module.exports = { checkBrandFit };
