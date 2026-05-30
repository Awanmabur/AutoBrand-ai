function buildCampaignPlan({ brand, goal, platforms, durationDays }) {
  const days = Math.max(Number(durationDays || 7), 1);
  const platformList = platforms.length ? platforms : ['facebook'];
  const pillars = ['Offer', 'Education', 'Trust', 'Reminder'];

  const postIdeas = Array.from({ length: Math.min(days, 30) }, (_, index) => {
    const platform = platformList[index % platformList.length];
    const pillar = pillars[index % pillars.length];
    return {
      day: index + 1,
      platform,
      title: `${pillar} post for ${brand.name}`,
      caption: `${brand.name}: ${goal || brand.preferredCta || 'Grow your business'} for ${brand.targetAudience || 'local customers'}.`
    };
  });

  return {
    contentPillars: pillars,
    suggestedTimes: ['8:00 AM', '1:00 PM', '7:00 PM'],
    postIdeas
  };
}

module.exports = { buildCampaignPlan };
