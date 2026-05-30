const DEFAULT_PLATFORM_RULES = {
  facebook: {
    displayName: 'Facebook', characterLimit: 63206, hashtagLimit: 30, mediaTypes: ['text', 'image', 'carousel', 'video'], aspectRatios: ['1:1', '4:5', '16:9'], maxVideoDurationSeconds: 240 * 60, supportsFirstComment: false, supportsAltText: true, supportsLinks: true, supportsCarousel: true, supportsStory: true, supportsThumbnail: true, supportsScheduling: true, supportsDirectPublishing: true, recommendedCaptionStyle: 'Conversational with a clear CTA.', recommendedHookStyle: 'Start with a benefit or local relevance.'
  },
  instagram: {
    displayName: 'Instagram', characterLimit: 2200, hashtagLimit: 30, mediaTypes: ['image', 'carousel', 'video', 'reel', 'story'], aspectRatios: ['1:1', '4:5', '9:16'], maxVideoDurationSeconds: 900, supportsFirstComment: false, supportsAltText: true, supportsLinks: false, supportsCarousel: true, supportsStory: true, supportsThumbnail: true, supportsScheduling: true, supportsDirectPublishing: true, recommendedCaptionStyle: 'Hook, value, CTA, and focused hashtags.', recommendedHookStyle: 'Lead with a scroll-stopping hook.'
  },
  linkedin: {
    displayName: 'LinkedIn', characterLimit: 3000, hashtagLimit: 10, mediaTypes: ['text', 'image', 'carousel', 'video', 'article'], aspectRatios: ['1:1', '1.91:1', '16:9'], maxVideoDurationSeconds: 600, supportsFirstComment: false, supportsAltText: true, supportsLinks: true, supportsCarousel: true, supportsStory: false, supportsThumbnail: true, supportsScheduling: true, supportsDirectPublishing: true, recommendedCaptionStyle: 'Professional, insight-led, and proof-based.', recommendedHookStyle: 'Open with a business insight or lesson.'
  },
  tiktok: {
    displayName: 'TikTok', characterLimit: 2200, hashtagLimit: 20, mediaTypes: ['video', 'reel'], aspectRatios: ['9:16'], maxVideoDurationSeconds: 600, supportsFirstComment: false, supportsAltText: false, supportsLinks: false, supportsCarousel: false, supportsStory: false, supportsThumbnail: true, supportsScheduling: true, supportsDirectPublishing: true, recommendedCaptionStyle: 'Short, casual, hashtag-friendly.', recommendedHookStyle: 'Strong first two seconds.'
  },
  youtube: {
    displayName: 'YouTube', characterLimit: 5000, hashtagLimit: 15, mediaTypes: ['video', 'short'], aspectRatios: ['16:9', '9:16'], maxVideoDurationSeconds: 43200, supportsFirstComment: false, supportsAltText: false, supportsLinks: true, supportsCarousel: false, supportsStory: false, supportsThumbnail: true, supportsScheduling: true, supportsDirectPublishing: true, recommendedCaptionStyle: 'Searchable title, helpful description, and tags.', recommendedHookStyle: 'Promise the outcome clearly.'
  },
  google_business: {
    displayName: 'Google Business Profile', characterLimit: 1500, hashtagLimit: 0, mediaTypes: ['text', 'image'], aspectRatios: ['1:1', '4:3'], maxVideoDurationSeconds: 30, supportsFirstComment: false, supportsAltText: false, supportsLinks: true, supportsCarousel: false, supportsStory: false, supportsThumbnail: false, supportsScheduling: true, supportsDirectPublishing: true, recommendedCaptionStyle: 'Local, direct, offer-focused.', recommendedHookStyle: 'Start with the service, offer, or update.'
  },
  pinterest: {
    displayName: 'Pinterest', characterLimit: 500, hashtagLimit: 20, mediaTypes: ['image', 'video'], aspectRatios: ['2:3', '1:1', '9:16'], maxVideoDurationSeconds: 900, supportsFirstComment: false, supportsAltText: true, supportsLinks: true, supportsCarousel: false, supportsStory: false, supportsThumbnail: true, supportsScheduling: true, supportsDirectPublishing: true, recommendedCaptionStyle: 'Keyword-rich and evergreen.', recommendedHookStyle: 'Describe the idea users can save.'
  },
  x: {
    displayName: 'X / Twitter', characterLimit: 280, hashtagLimit: 5, mediaTypes: ['text', 'image', 'video'], aspectRatios: ['1:1', '16:9'], maxVideoDurationSeconds: 140, supportsFirstComment: true, supportsAltText: true, supportsLinks: true, supportsCarousel: false, supportsStory: false, supportsThumbnail: false, supportsScheduling: true, supportsDirectPublishing: true, recommendedCaptionStyle: 'Short, sharp, and conversational.', recommendedHookStyle: 'Open with the strongest point.'
  },
  threads: {
    displayName: 'Threads', characterLimit: 500, hashtagLimit: 10, mediaTypes: ['text', 'image', 'video'], aspectRatios: ['1:1', '4:5', '9:16'], maxVideoDurationSeconds: 300, supportsFirstComment: true, supportsAltText: true, supportsLinks: true, supportsCarousel: true, supportsStory: false, supportsThumbnail: false, supportsScheduling: true, supportsDirectPublishing: true, recommendedCaptionStyle: 'Casual, human, discussion-led.', recommendedHookStyle: 'Ask or state something people can reply to.'
  },
  whatsapp: {
    displayName: 'WhatsApp', characterLimit: 4096, hashtagLimit: 0, mediaTypes: ['text', 'image', 'video'], aspectRatios: ['1:1', '16:9', '9:16'], maxVideoDurationSeconds: 90, supportsFirstComment: false, supportsAltText: false, supportsLinks: true, supportsCarousel: false, supportsStory: false, supportsThumbnail: false, supportsScheduling: true, supportsDirectPublishing: true, recommendedCaptionStyle: 'Personal, concise, and action-oriented.', recommendedHookStyle: 'Lead with the customer benefit.'
  }
};

module.exports = { DEFAULT_PLATFORM_RULES };
