const RISK_PATTERNS = [
  { label: 'guaranteed outcome', pattern: /\b(guaranteed|100%|risk-free|instant results)\b/i },
  { label: 'medical claim', pattern: /\b(cure|treats|diagnose|medical miracle)\b/i },
  { label: 'financial claim', pattern: /\b(get rich|double your money|guaranteed profit)\b/i },
  { label: 'urgency pressure', pattern: /\b(act now or lose|last chance forever)\b/i }
];

function checkRisk(content = {}, brand = {}) {
  const caption = String(content.caption || '');
  const compliance = brand.complianceNotes || [];
  const hits = RISK_PATTERNS.filter((item) => item.pattern.test(caption)).map((item) => item.label);
  const score = Math.min(100, hits.length * 25 + (compliance.length ? 0 : 5));
  return {
    score,
    risks: hits,
    warning: hits.length ? `Review possible ${hits.join(', ')} language before publishing.` : ''
  };
}

module.exports = { checkRisk, RISK_PATTERNS };
