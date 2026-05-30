function scoreContent(content = {}) {
  const caption = String(content.caption || '');
  const hashtags = content.hashtags || [];
  let score = 30;
  const notes = [];
  if (caption.length >= 60) score += 15; else notes.push('Caption is very short. Add value or context.');
  if (/\b(you|your|today|now|start|book|learn|get)\b/i.test(caption)) score += 10; else notes.push('Add a direct audience or CTA phrase.');
  if (/[?!]/.test(caption) || /^\w+[:]/.test(caption)) score += 8; else notes.push('Use a stronger opening hook.');
  if (hashtags.length || /#[\w-]+/.test(caption)) score += 7; else notes.push('Add relevant hashtags where the platform supports them.');
  if (content.media?.length || content.mediaCount || content.type === 'image' || content.type === 'video') score += 15; else notes.push('Consider adding media for stronger engagement.');
  if (content.link) score += 5;
  if (caption.length > 2200) score -= 10;
  return { score: Math.max(0, Math.min(100, score)), notes };
}

module.exports = { scoreContent };
