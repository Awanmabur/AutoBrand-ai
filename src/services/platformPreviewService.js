const limits = {
  facebook: { caption: 63206, title: 120, tip: 'Use one clear CTA and a first line that works without clicking more.' },
  instagram: { caption: 2200, title: 80, tip: 'Keep the hook in the first 125 characters and use 3 to 8 focused hashtags.' },
  tiktok: { caption: 2200, title: 70, tip: 'Make the caption direct and pair it with a short vertical video idea.' },
  youtube: { caption: 5000, title: 100, tip: 'Use the title as the hook and put the strongest keyword early.' },
  whatsapp: { caption: 1000, title: 80, tip: 'Write like a direct message and make the next action obvious.' },
  linkedin: { caption: 3000, title: 150, tip: 'Lead with a practical insight, proof point, or business outcome.' },
  x: { caption: 280, title: 70, tip: 'Shorten aggressively and move hashtags to one or two maximum.' },
  pinterest: { caption: 500, title: 100, tip: 'Make the title searchable and include a benefit-led description.' }
};

function buildPlatformPreview(post) {
  const rule = limits[post.platform] || limits.facebook;
  const caption = post.caption || '';
  const title = post.title || '';
  const hashtagCount = Array.isArray(post.hashtags) ? post.hashtags.length : 0;
  const warnings = [];

  if (caption.length > rule.caption) warnings.push(`Caption is ${caption.length - rule.caption} characters over the ${post.platform} limit.`);
  if (title.length > rule.title) warnings.push(`Title is ${title.length - rule.title} characters over the recommended limit.`);
  if (['instagram', 'tiktok'].includes(post.platform) && hashtagCount < 3) warnings.push('Add at least three focused hashtags for this platform.');
  if (post.platform === 'x' && hashtagCount > 2) warnings.push('Use one or two hashtags on X/Twitter.');
  if (!post.link && ['facebook', 'linkedin', 'pinterest'].includes(post.platform)) warnings.push('Add a link when the goal is traffic or lead generation.');

  return {
    platform: post.platform,
    title,
    caption,
    hashtags: post.hashtags || [],
    link: post.link || '',
    titleCount: title.length,
    captionCount: caption.length,
    captionLimit: rule.caption,
    titleLimit: rule.title,
    tip: rule.tip,
    warnings
  };
}

module.exports = { buildPlatformPreview };
