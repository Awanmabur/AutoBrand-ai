const FILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    download_url: { type: 'string', format: 'uri' },
    file_id: { type: 'string', minLength: 1 },
    mime_type: { type: 'string' },
    file_name: { type: 'string' }
  },
  required: ['download_url', 'file_id']
};

const PLATFORMS = ['facebook', 'instagram', 'google_business', 'linkedin', 'pinterest', 'tiktok', 'youtube', 'x', 'threads'];
const POST_STATUSES = ['draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'provider_processing', 'published', 'failed', 'cancelled', 'rejected'];
const oauth = (scopes) => [{ type: 'oauth2', scopes }];

const profileOutput = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    nickname: { type: 'string' }
  },
  required: ['id']
};

const postSummarySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    brandId: { type: 'string' },
    title: { type: 'string' },
    caption: { type: 'string' },
    platforms: { type: 'array', items: { type: 'string' } },
    type: { type: 'string' },
    status: { type: 'string' },
    scheduledAt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    publishedAt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    publishResults: { type: 'array', items: { type: 'object', additionalProperties: true } },
    errorMessage: { type: 'string' }
  },
  required: ['id', 'brandId', 'platforms', 'status']
};

const mediaSummarySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' }, brandId: { type: 'string' }, fileName: { type: 'string' }, fileType: { type: 'string' },
    mimeType: { type: 'string' }, size: { type: 'number' }, fileUrl: { type: 'string' }, status: { type: 'string' },
    storageProvider: { type: 'string' }, driveFileId: { type: 'string' }, driveWebViewLink: { type: 'string' }
  },
  required: ['id', 'brandId', 'fileName', 'fileType', 'mimeType', 'size', 'status']
};

const outputSchemas = {
  get_profile: profileOutput,
  list_brands: {
    type: 'object', additionalProperties: false,
    properties: { brands: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { id: { type: 'string' }, name: { type: 'string' }, permissions: { type: 'array', items: { type: 'string' } } }, required: ['id', 'name'] } } },
    required: ['brands']
  },
  get_brand: { type: 'object', additionalProperties: false, properties: { brand: { type: 'object', additionalProperties: true } }, required: ['brand'] },
  list_connected_accounts: {
    type: 'object', additionalProperties: false,
    properties: { accounts: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { id: { type: 'string' }, brandId: { type: 'string' }, platform: { type: 'string' }, name: { type: 'string' }, readyToPublish: { type: 'boolean' }, blockers: { type: 'array', items: {} } }, required: ['id', 'brandId', 'platform', 'readyToPublish'] } } },
    required: ['accounts']
  },
  upload_media: { type: 'object', additionalProperties: false, properties: { media: mediaSummarySchema, storageDestination: { type: 'string' }, warning: { type: 'string' } }, required: ['media', 'storageDestination', 'warning'] },
  get_storage_status: { type: 'object', additionalProperties: true, properties: { preference: { type: 'string' }, googleDriveConfigured: { type: 'boolean' }, googleDrive: { type: 'object', additionalProperties: true } }, required: ['preference', 'googleDriveConfigured', 'googleDrive'] },
  list_media: { type: 'object', additionalProperties: false, properties: { media: { type: 'array', items: mediaSummarySchema } }, required: ['media'] },
  sync_media_to_drive: { type: 'object', additionalProperties: false, properties: { media: mediaSummarySchema, reused: { type: 'boolean' } }, required: ['media', 'reused'] },
  create_draft: { type: 'object', additionalProperties: false, properties: { reused: { type: 'boolean' }, post: postSummarySchema }, required: ['reused', 'post'] },
  update_draft: { type: 'object', additionalProperties: false, properties: { post: postSummarySchema }, required: ['post'] },
  publish_post: { type: 'object', additionalProperties: false, properties: { reused: { type: 'boolean' }, queued: { type: 'boolean' }, post: postSummarySchema }, required: ['reused', 'queued', 'post'] },
  publish_draft: { type: 'object', additionalProperties: false, properties: { queued: { type: 'boolean' }, post: postSummarySchema }, required: ['queued', 'post'] },
  schedule_post: { type: 'object', additionalProperties: false, properties: { reused: { type: 'boolean' }, queued: { type: 'boolean' }, post: postSummarySchema }, required: ['reused', 'queued', 'post'] },
  schedule_draft: { type: 'object', additionalProperties: false, properties: { queued: { type: 'boolean' }, post: postSummarySchema }, required: ['queued', 'post'] },
  list_posts: { type: 'object', additionalProperties: false, properties: { posts: { type: 'array', items: postSummarySchema } }, required: ['posts'] },
  get_post: { type: 'object', additionalProperties: false, properties: { post: postSummarySchema }, required: ['post'] },
  list_scheduled_posts: { type: 'object', additionalProperties: false, properties: { posts: { type: 'array', items: postSummarySchema } }, required: ['posts'] },
  cancel_scheduled_post: { type: 'object', additionalProperties: false, properties: { post: postSummarySchema }, required: ['post'] },
  get_ai_brain: { type: 'object', additionalProperties: false, properties: { brandId: { type: 'string' }, brandName: { type: 'string' }, aiBrain: { type: 'object', additionalProperties: true }, autoPosting: { type: 'object', additionalProperties: true } }, required: ['brandId', 'brandName', 'aiBrain', 'autoPosting'] },
  update_ai_brain: { type: 'object', additionalProperties: false, properties: { brandId: { type: 'string' }, brandName: { type: 'string' }, aiBrain: { type: 'object', additionalProperties: true }, autoPosting: { type: 'object', additionalProperties: true } }, required: ['brandId', 'brandName', 'aiBrain', 'autoPosting'] },
  run_ai_brain_now: { type: 'object', additionalProperties: true, properties: { brandId: { type: 'string' }, created: { type: 'number' }, scheduled: { type: 'number' }, awaitingApproval: { type: 'number' } }, required: ['brandId'] },
  get_analytics_summary: { type: 'object', additionalProperties: true, properties: { brandId: { type: 'string' }, brandName: { type: 'string' }, recordCount: { type: 'number' }, totals: { type: 'object', additionalProperties: true }, topPosts: { type: 'array', items: { type: 'object', additionalProperties: true } } }, required: ['brandId', 'brandName', 'recordCount', 'totals', 'topPosts'] }
};

const basePostProperties = {
  brandId: { type: 'string', minLength: 1 },
  text: { type: 'string', maxLength: 20000 },
  title: { type: 'string', maxLength: 240 },
  platforms: { type: 'array', items: { type: 'string', enum: PLATFORMS }, minItems: 1, uniqueItems: true },
  accountIds: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
  mediaIds: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
  type: { type: 'string', enum: ['text', 'image', 'carousel', 'video', 'reel', 'story', 'link', 'article', 'campaign'] },
  contentGoal: { type: 'string', enum: ['awareness', 'engagement', 'sales', 'traffic', 'lead_generation', 'community', 'customer_support', 'launch', 'event', 'other'] },
  hashtags: { type: 'array', items: { type: 'string', maxLength: 120 }, maxItems: 50 },
  firstComment: { type: 'string', maxLength: 5000 },
  altText: { type: 'string', maxLength: 2000 },
  link: { type: 'string', format: 'uri', maxLength: 2000 },
  clientRequestId: { type: 'string', maxLength: 160 }
};

function tool(definition) {
  const schemes = oauth([definition.scope]);
  const actionText = definition.invoking || definition.title;
  return {
    ...definition,
    outputSchema: outputSchemas[definition.name],
    securitySchemes: schemes,
    _meta: {
      securitySchemes: schemes,
      'openai/toolInvocation/invoking': String(actionText).slice(0, 64),
      'openai/toolInvocation/invoked': String(definition.invoked || `${definition.title} complete`).slice(0, 64),
      ...(definition._meta || {})
    }
  };
}

const tools = [
  tool({ name: 'get_profile', title: 'Get AutoBrand profile', description: 'Return the profile represented by the authenticated AutoBrand AI connection so the user can recognize which account is linked.', scope: 'autobrand.read', inputSchema: { type: 'object', additionalProperties: false, properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, _meta: { 'openai/profile': true } }),
  tool({ name: 'list_brands', title: 'List brands', description: 'List AutoBrand brands/workspaces the authenticated user can access, including their permissions.', scope: 'autobrand.read', inputSchema: { type: 'object', additionalProperties: false, properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }),
  tool({ name: 'get_brand', title: 'Get brand', description: 'Get brand voice, content pillars, visual preferences and permissions for one AutoBrand brand.', scope: 'autobrand.read', inputSchema: { type: 'object', additionalProperties: false, properties: { brandId: { type: 'string', minLength: 1 } }, required: ['brandId'] }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }),
  tool({ name: 'list_connected_accounts', title: 'List connected social accounts', description: 'List social accounts connected to AutoBrand and their live publishing readiness/blockers. Optionally filter by brand.', scope: 'autobrand.read', inputSchema: { type: 'object', additionalProperties: false, properties: { brandId: { type: 'string', minLength: 1 } } }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }),
  tool({ name: 'get_storage_status', title: 'Get asset storage status', description: 'Show whether Google Drive is connected and whether this AutoBrand user stores new ChatGPT assets in AutoBrand, Google Drive, or both.', scope: 'autobrand.read', inputSchema: { type: 'object', additionalProperties: false, properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }),
  tool({ name: 'list_media', title: 'List media assets', description: 'List recent AutoBrand assets for one brand, including whether each item is stored in AutoBrand, Google Drive, or both.', scope: 'autobrand.read', inputSchema: { type: 'object', additionalProperties: false, properties: { brandId: { type: 'string', minLength: 1 }, fileType: { type: 'string', enum: ['image','video','audio','document','other'] }, includeArchived: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['brandId'] }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }),
  tool({ name: 'sync_media_to_drive', title: 'Back up media to Google Drive', description: "Copy an existing AutoBrand media asset into the user\'s connected Google Drive while keeping the original AutoBrand copy.", scope: 'autobrand.write', inputSchema: { type: 'object', additionalProperties: false, properties: { mediaId: { type: 'string', minLength: 1 } }, required: ['mediaId'] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true } }),
  tool({ name: 'upload_media', title: 'Upload media to AutoBrand', description: "Upload a ChatGPT-generated or user file as an AutoBrand asset. storageDestination may be platform, google_drive, or both; omit it to use the user\'s saved storage preference. Use the returned media ID when drafting, scheduling or publishing.", scope: 'autobrand.write', inputSchema: { type: 'object', additionalProperties: false, $defs: { OpenAIFile: FILE_SCHEMA }, properties: { brandId: { type: 'string', minLength: 1 }, file: { $ref: '#/$defs/OpenAIFile' }, storageDestination: { type: 'string', enum: ['platform','google_drive','both'] } }, required: ['brandId', 'file'] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }, _meta: { 'openai/fileParams': ['file'] } }),
  tool({ name: 'create_draft', title: 'Create draft', description: 'Create a manual social post draft in AutoBrand without publishing it.', scope: 'autobrand.write', inputSchema: { type: 'object', additionalProperties: false, properties: basePostProperties, required: ['brandId', 'text'] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } }),
  tool({ name: 'update_draft', title: 'Update draft', description: 'Edit an existing AutoBrand draft. Only draft posts can be changed by this tool.', scope: 'autobrand.write', inputSchema: { type: 'object', additionalProperties: false, properties: { postId: { type: 'string', minLength: 1 }, text: { type: 'string', maxLength: 20000 }, title: { type: 'string', maxLength: 240 }, platforms: basePostProperties.platforms, accountIds: basePostProperties.accountIds, mediaIds: basePostProperties.mediaIds, type: basePostProperties.type, hashtags: basePostProperties.hashtags, link: basePostProperties.link }, required: ['postId'] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } }),
  tool({ name: 'publish_post', title: 'Publish post now', description: 'Create a post and publish it through AutoBrand to selected connected social platforms. This sends content to real external social accounts immediately.', scope: 'autobrand.publish', inputSchema: { type: 'object', additionalProperties: false, properties: basePostProperties, required: ['brandId', 'text', 'platforms'] }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }, invoking: 'Publishing post', invoked: 'Post queued for publishing' }),
  tool({ name: 'publish_draft', title: 'Publish existing draft', description: 'Publish an existing AutoBrand draft immediately using its selected destinations. This sends content to real external social accounts.', scope: 'autobrand.publish', inputSchema: { type: 'object', additionalProperties: false, properties: { postId: { type: 'string', minLength: 1 } }, required: ['postId'] }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }, invoking: 'Publishing draft', invoked: 'Draft queued for publishing' }),
  tool({ name: 'schedule_post', title: 'Schedule post', description: 'Create and schedule a social post for a future ISO-8601 date/time through AutoBrand. This creates a future external publishing action that can be cancelled before publishing starts.', scope: 'autobrand.publish', inputSchema: { type: 'object', additionalProperties: false, properties: { ...basePostProperties, publishAt: { type: 'string', format: 'date-time' } }, required: ['brandId', 'text', 'platforms', 'publishAt'] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true } }),
  tool({ name: 'schedule_draft', title: 'Schedule existing draft', description: 'Schedule an existing AutoBrand draft for a future ISO-8601 date/time.', scope: 'autobrand.publish', inputSchema: { type: 'object', additionalProperties: false, properties: { postId: { type: 'string', minLength: 1 }, publishAt: { type: 'string', format: 'date-time' } }, required: ['postId', 'publishAt'] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true } }),
  tool({ name: 'list_posts', title: 'List recent posts', description: 'List recent AutoBrand posts the user can access, optionally filtered by brand and status.', scope: 'autobrand.read', inputSchema: { type: 'object', additionalProperties: false, properties: { brandId: { type: 'string', minLength: 1 }, status: { type: 'string', enum: POST_STATUSES }, limit: { type: 'integer', minimum: 1, maximum: 100 } } }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }),
  tool({ name: 'get_post', title: 'Get post status', description: 'Get current status, scheduling time and provider delivery results for one AutoBrand post.', scope: 'autobrand.read', inputSchema: { type: 'object', additionalProperties: false, properties: { postId: { type: 'string', minLength: 1 } }, required: ['postId'] }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }),
  tool({ name: 'list_scheduled_posts', title: 'List scheduled posts', description: 'List future scheduled AutoBrand posts.', scope: 'autobrand.read', inputSchema: { type: 'object', additionalProperties: false, properties: { brandId: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 } } }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }),
  tool({ name: 'cancel_scheduled_post', title: 'Cancel scheduled post', description: 'Cancel a scheduled or pending AutoBrand post before provider publishing begins.', scope: 'autobrand.publish', inputSchema: { type: 'object', additionalProperties: false, properties: { postId: { type: 'string', minLength: 1 } }, required: ['postId'] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true } }),
  tool({ name: 'get_ai_brain', title: 'Get AI Brain settings', description: 'Read the AutoBrand AI Brain operating mode, content source, safety settings and posting cadence for one brand.', scope: 'autobrand.read', inputSchema: { type: 'object', additionalProperties: false, properties: { brandId: { type: 'string', minLength: 1 } }, required: ['brandId'] }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }),
  tool({ name: 'update_ai_brain', title: 'Update AI Brain settings', description: 'Configure how AutoBrand AI Brain assists, prepares content for approval, or runs Autopilot. Plan entitlements and brand permissions are enforced.', scope: 'autobrand.write', inputSchema: { type: 'object', additionalProperties: false, properties: { brandId: { type: 'string', minLength: 1 }, enabled: { type: 'boolean' }, operatingMode: { type: 'string', enum: ['assist','approval','autopilot'] }, contentSource: { type: 'string', enum: ['manual_assets','chatgpt_operator','autobrand_ai','hybrid'] }, learnFromAnalytics: { type: 'boolean' }, useBestTimes: { type: 'boolean' }, requireApproval: { type: 'boolean' }, autoPublish: { type: 'boolean' }, pauseOnError: { type: 'boolean' }, minContentScore: { type: 'integer', minimum: 1, maximum: 100 }, instructions: { type: 'string', maxLength: 5000 }, frequencyUnit: { type: 'string', enum: ['day','week','month'] }, postsPerDay: { type: 'integer', minimum: 1, maximum: 12 }, postsPerWeek: { type: 'integer', minimum: 1, maximum: 60 }, postsPerMonth: { type: 'integer', minimum: 1, maximum: 90 }, preferredSlots: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 12 }, mediaMix: { type: 'array', items: { type: 'string', enum: ['auto','image','slides','video'] }, maxItems: 4 } }, required: ['brandId'] }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true } }),
  tool({ name: 'run_ai_brain_now', title: 'Run AI Brain now', description: 'Immediately run the configured AutoBrand AI Brain for one brand. This can create drafts, approval items or scheduled posts and may consume AutoBrand AI credits.', scope: 'autobrand.publish', inputSchema: { type: 'object', additionalProperties: false, properties: { brandId: { type: 'string', minLength: 1 } }, required: ['brandId'] }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false } }),
  tool({ name: 'get_analytics_summary', title: 'Get analytics summary', description: 'Get aggregate social performance and top recent posts for an AutoBrand brand, with optional platform/date filters.', scope: 'autobrand.read', inputSchema: { type: 'object', additionalProperties: false, properties: { brandId: { type: 'string', minLength: 1 }, platforms: { type: 'array', items: { type: 'string', enum: PLATFORMS }, uniqueItems: true }, from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' } }, required: ['brandId'] }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } })
];

module.exports = { tools, PLATFORMS, POST_STATUSES };
