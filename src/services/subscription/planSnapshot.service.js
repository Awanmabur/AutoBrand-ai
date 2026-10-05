function plain(value) {
  if (value == null) return value;
  if (typeof value.toObject === 'function') return value.toObject({ virtuals: false });
  return JSON.parse(JSON.stringify(value));
}

function snapshotPlan(plan) {
  if (!plan) return null;
  const source = plain(plan) || {};
  return {
    planId: source._id ? String(source._id) : (source.planId ? String(source.planId) : ''),
    name: String(source.name || source.slug || 'Plan'),
    slug: String(source.slug || 'free-trial'),
    description: String(source.description || ''),
    price: Number(source.price || 0),
    currency: String(source.currency || 'USD').toUpperCase(),
    billingInterval: String(source.billingInterval || 'month'),
    trialDays: Number(source.trialDays || 0),
    includedCredits: Number(source.includedCredits || 0),
    queuePriority: Number(source.queuePriority || 5),
    sortOrder: Number(source.sortOrder || 100),
    features: plain(source.features || {}),
    limits: plain(source.limits || {}),
    aiConfig: plain(source.aiConfig || {}),
    featureList: Array.isArray(source.featureList) ? source.featureList.map(String) : [],
    capturedAt: new Date().toISOString()
  };
}

function planFromSnapshot(snapshot, fallbackPlanRef) {
  if (!snapshot?.slug) return null;
  return {
    _id: fallbackPlanRef || snapshot.planId || undefined,
    name: snapshot.name,
    slug: snapshot.slug,
    description: snapshot.description || '',
    price: Number(snapshot.price || 0),
    currency: String(snapshot.currency || 'USD').toUpperCase(),
    billingInterval: snapshot.billingInterval || 'month',
    trialDays: Number(snapshot.trialDays || 0),
    includedCredits: Number(snapshot.includedCredits || 0),
    queuePriority: Number(snapshot.queuePriority || 5),
    sortOrder: Number(snapshot.sortOrder || 100),
    features: plain(snapshot.features || {}),
    limits: plain(snapshot.limits || {}),
    aiConfig: plain(snapshot.aiConfig || {}),
    featureList: Array.isArray(snapshot.featureList) ? snapshot.featureList.slice() : [],
    isTrial: snapshot.billingInterval === 'trial' || Number(snapshot.price || 0) === 0,
    snapshotCapturedAt: snapshot.capturedAt || ''
  };
}

module.exports = { planFromSnapshot, snapshotPlan };
