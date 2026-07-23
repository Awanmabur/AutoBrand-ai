const mongoose = require("mongoose");
const AiJob = require("../models/AiJob");
const Brand = require("../models/Brand");
const Media = require("../models/Media");
const Notification = require("../models/Notification");
const Post = require("../models/Post");
const SocialAccount = require("../models/SocialAccount");
const UsageLog = require("../models/UsageLog");
const User = require("../models/User");
const env = require("../config/env");
const {
  generatePostIdea,
  generateImageAsset,
  buildCreativePackage,
} = require("./aiContentService");
const {
  generateImage,
  generateVideo,
  activeProvider,
} = require("./ai.service");
const {
  createPlatformVariations,
} = require("./composer/platformVariation.service");
const {
  validateComposerSubmission,
} = require("./composer/composerPayloadValidation.service");
const {
  creditsForGeneration,
  normalizeGenerationControls,
} = require("./aiContentGeneration.service");
const { spendCredits } = require("./creditService");
const { dispatchScheduledPost } = require("./postDispatchService");
const {
  createConnectivityBackoff,
  isMongoConnectivityError,
  isMongoReady,
  mongoUnavailableError,
  onMongoReady,
} = require("./runtimeConnectivity.service");
const {
  archiveMissingGeneratedMedia,
  partitionAvailableMedia,
} = require("./mediaAvailability.service");

const TASK_TYPE = "post_content_generation";
const LEGACY_VIDEO_TASK_TYPE = "post_video_generation";
const TASK_TYPES = [TASK_TYPE, LEGACY_VIDEO_TASK_TYPE];

const IMAGE_CAPABLE_PLATFORMS = new Set([
  "facebook",
  "google_business",
  "instagram",
  "linkedin",
  "pinterest",
  "threads",
  "x",
]);

const TEXT_ONLY_CAPABLE_PLATFORMS = new Set([
  "facebook",
  "google_business",
  "linkedin",
  "threads",
  "x",
]);

function platformsAllowTextOnly(value) {
  const selected = toArray(value).map((platform) =>
    String(platform || "").toLowerCase(),
  );
  return (
    selected.length > 0 &&
    selected.every((platform) => TEXT_ONLY_CAPABLE_PLATFORMS.has(platform))
  );
}

function platformsAllowImages(value) {
  const selected = toArray(value).map((platform) =>
    String(platform || "").toLowerCase(),
  );
  return (
    selected.length > 0 &&
    selected.every((platform) => IMAGE_CAPABLE_PLATFORMS.has(platform))
  );
}

const RUNNING_STALE_MS = 30 * 60 * 1000;
const MAX_RETRIES = 2;
const RUNTIME_RECOVERY_VERSION = "publishing-scheduling-v2";

let timer = null;
let tickRunning = false;
let stopped = false;
let lastActionRecoveryAt = 0;
let unsubscribeMongoReady = null;
const ACTION_RECOVERY_INTERVAL_MS = Math.max(10000, Number(process.env.GENERATION_ACTION_RECOVERY_MS || 30000));
const generationMongoBackoff = createConnectivityBackoff({
  label: "AI generation",
  minMs: Math.max(2000, Number(process.env.MONGO_WORKER_BACKOFF_MIN_MS || 5000)),
  maxMs: Math.max(10000, Number(process.env.MONGO_WORKER_BACKOFF_MAX_MS || 120000)),
  logIntervalMs: Math.max(15000, Number(process.env.MONGO_WORKER_LOG_INTERVAL_MS || 60000)),
});

const activeWorkers = {
  content: 0,
  video: 0,
};

/**
 * Marks an application-created MongoDB operator object as trusted.
 *
 * This allows global Mongoose sanitizeFilter protection to remain enabled
 * while preventing trusted internal operators such as $in, $ne, and $lte
 * from being converted into literal equality values.
 */
function trustedOperator(operator) {
  return mongoose.trusted(operator);
}

function generationJobTag(jobId) {
  return `generation-job-${cleanObjectId(jobId)}`;
}

function generationSlotTag(slot) {
  return `generation-slot-${Number(slot)}`;
}

function toArray(value) {
  if (!value) return [];

  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function splitHashtags(value) {
  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map((tag) => (String(tag).startsWith("#") ? String(tag) : `#${tag}`));
  }

  return String(value || "")
    .split(/\s|,/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

function cleanObjectId(value) {
  return value && value.toString ? value.toString() : String(value || "");
}

function dedupeIds(values = []) {
  const seen = new Set();

  return values.filter(Boolean).filter((value) => {
    const key = cleanObjectId(value);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeProvider(value, kind) {
  const provider = String(value || "")
    .trim()
    .toLowerCase();

  const supported =
    kind === "video"
      ? ["openai", "replicate", "local"]
      : ["openai", "replicate", "gemini", "local"];

  return supported.includes(provider) ? provider : undefined;
}

function generatedImageTarget(body = {}, brand = {}) {
  const type = String(body.type || "").toLowerCase();

  const configured = Number(
    body.imageCount ||
      body.imagesPerPostMax ||
      brand.autoPosting?.imagesPerPostMax ||
      1,
  );

  const count = Math.max(
    1,
    Math.min(5, Number.isFinite(configured) ? configured : 1),
  );

  if (type === "carousel" || body.mediaFormat === "carousel_slides") {
    return Math.max(2, count);
  }

  return count;
}

function buildPostGenerationPlan(
  body = {},
  selectedMediaRows = [],
  brand = {},
) {
  const type = String(body.type || "image")
    .trim()
    .toLowerCase();

  const imageRows = selectedMediaRows.filter(
    (media) => media?.fileType === "image",
  );

  const videoRows = selectedMediaRows.filter(
    (media) => media?.fileType === "video",
  );

  const isVideo =
    ["video", "reel"].includes(type) || body.mediaFormat === "short_video";

  const isImage =
    ["image", "story", "carousel", "campaign"].includes(type) ||
    body.mediaFormat === "carousel_slides";

  const targetImageCount = isImage ? generatedImageTarget(body, brand) : 0;

  const creationMode = String(body.creationMode || "ai").toLowerCase();

  const needsText =
    creationMode !== "manual" ||
    body.action === "regenerate" ||
    !String(body.caption || "").trim();

  const imageGenerationRequested =
    isImage &&
    (creationMode !== "manual" ||
      body.generateImage === "on" ||
      ["ai_image", "openai_image", "replicate_image", "gemini_image"].includes(
        String(body.imageMode || "").toLowerCase(),
      ) ||
      ["generate_ai_image", "generate_openai_image"].includes(
        String(body.mediaHandoff || "").toLowerCase(),
      ));

  const imagesToGenerate = imageGenerationRequested
    ? Math.max(0, targetImageCount - imageRows.length)
    : 0;

  const needsVideo = isVideo && videoRows.length === 0;

  return {
    type,
    isVideo,
    isImage,
    needsText,
    needsVideo,
    imagesToGenerate,
    targetImageCount,
    needsGeneration: needsText || needsVideo || imagesToGenerate > 0,
    sourceImageId: imageRows[0]?._id ? cleanObjectId(imageRows[0]._id) : "",
    existingImageIds: imageRows.map((row) => cleanObjectId(row._id)),
    existingVideoIds: videoRows.map((row) => cleanObjectId(row._id)),
  };
}

function normalizeJobMetadata(job, post) {
  const metadata = job.metadata || {};

  if (job.taskType !== LEGACY_VIDEO_TASK_TYPE) {
    return metadata;
  }

  const body = {
    creationMode: "manual",
    type: "video",
    mediaFormat: "short_video",
    caption: post.caption || metadata.prompt || "",
    title: post.title || "",
    description: post.description || "",
    platforms: post.platforms?.length
      ? post.platforms
      : [post.platform || "facebook"],
    platform: post.platform || "facebook",
    videoPrompt: metadata.prompt || post.caption || "",
    videoProvider: metadata.preferredProvider || job.provider || "",
    videoModel: metadata.model || job.model || "",
    videoAspectRatio: metadata.aspectRatio || "9:16",
    videoDurationSeconds: metadata.durationSeconds || 8,
  };

  return {
    ...metadata,
    body,
    selectedMediaIds: metadata.sourceMediaId ? [metadata.sourceMediaId] : [],
    plan: {
      type: "video",
      isVideo: true,
      isImage: false,
      needsText: false,
      needsVideo: true,
      imagesToGenerate: 0,
      targetImageCount: 0,
      needsGeneration: true,
      sourceImageId: metadata.sourceMediaId || "",
      existingImageIds: metadata.sourceMediaId ? [metadata.sourceMediaId] : [],
      existingVideoIds: [],
    },
  };
}

function generationMetadata(post, patch = {}) {
  const current =
    post.platformMetadata && typeof post.platformMetadata === "object"
      ? post.platformMetadata
      : {};

  return {
    ...current,
    generation: {
      ...(current.generation || {}),
      ...patch,
      updatedAt: new Date(),
    },
  };
}

function buildCreativePlan(body, brand, sourceMedia, generated = null) {
  const packageData = generated
    ? buildCreativePackage({
        brand,
        platform: body.platform || "facebook",
        goal: body.goal || body.offer || "",
        contentType: body.contentType || "promo",
        sourceMedia: sourceMedia || null,
      })
    : null;

  return {
    creationMode: body.creationMode || "ai",
    goal: body.goal || "",
    contentType: body.contentType || "",
    audience: body.audience || "",
    offer: body.offer || "",
    tone: body.tone || "",
    imageMode: body.imageMode || "manual_upload",
    imagePrompt: body.imagePrompt || generated?.imagePrompt || "",
    imageIdea: body.imageIdea || generated?.imageIdea || "",
    videoMode: body.videoMode || "manual_upload",
    videoPrompt: body.videoPrompt || generated?.videoScript || "",
    videoScript: body.videoScript || generated?.videoScript || "",
    imageProvider: body.imageProvider || "prompt_or_default",
    videoProvider: body.videoProvider || "prompt_or_default",
    mediaHandoff: body.mediaHandoff || "prepare_prompt",
    selectedOwnerMediaConsent: body.selectedOwnerMediaConsent === "on",
    imageChecklist: packageData?.imageGenerationChecklist || [],
    videoChecklist: packageData?.videoGenerationChecklist || [],
    handoffSteps: packageData?.handoffSteps || [],
    qualityChecklist: [
      "Brand-specific offer or value promise included",
      "Clear call to action included",
      "Caption is readable and platform-safe",
      "Media/prompt prepared for image or video creative",
      "Selected Pages are explicit before publish",
    ],
    generatedAt: generated ? new Date() : null,
    generatedProvider: generated?.provider || null,
    generatedScore: generated?.contentScore || null,
    generatedBundle: generated?.generatedBundle || null,
    platformOutputs: generated?.platformOutputs || [],
    campaignPlan: generated?.campaignPlan || [],
    carouselSlides: generated?.carouselSlides || [],
    videoScenes: generated?.videoScenes || [],
    warnings: {
      brandRuleWarnings: generated?.brandRuleWarnings || [],
      blockedWordWarnings: generated?.blockedWordWarnings || [],
      riskWarnings: generated?.riskWarnings || [],
    },
    improvementSuggestion: generated?.improvementSuggestion || null,
    safetyNotes: generated?.safetyNotes || null,
  };
}

async function notify(userId, payload) {
  if (!userId) return;

  await Notification.create({
    user: userId,
    severity: payload.severity || "info",
    entityType: "Post",
    entityId: payload.postId,
    actionUrl: "/dashboard/content-library",
    ...payload,
  }).catch(() => {});
}

async function mapWithConcurrency(items, limit, task) {
  const queue = Array.from(items || []);
  const results = new Array(queue.length);

  let nextIndex = 0;

  const workerCount = Math.max(
    1,
    Math.min(Number(limit || 1), queue.length || 1),
  );

  async function worker() {
    while (nextIndex < queue.length) {
      const index = nextIndex;

      nextIndex += 1;
      results[index] = await task(queue[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

async function createImageMedia({
  body,
  brand,
  userId,
  sourceMedia,
  generated,
  count,
  jobId,
}) {
  if (!count) {
    return {
      mediaIds: [],
      errors: [],
    };
  }

  const requestedType = String(body.type || "image").toLowerCase();

  const jobTag = generationJobTag(jobId);

  const jobs = await mapWithConcurrency(
    Array.from({ length: count }),
    env.aiImageGenerationConcurrency || 3,
    async (_item, index) => {
      const slideOffset = Number(body.__existingImageCount || 0);

      const slideNumber = slideOffset + index + 1;

      const slideTotal = Math.max(
        slideNumber,
        Number(body.imageCount || slideNumber),
      );

      const slotTag = generationSlotTag(slideNumber);

      const existing = await Media.findOne({
        uploadedBy: userId,
        fileType: "image",
        status: trustedOperator({
          $ne: "archived",
        }),
        tags: trustedOperator({
          $all: [jobTag, slotTag],
        }),
      });

      if (existing) {
        return {
          mediaId: existing._id,
        };
      }

      const creativePrefix =
        requestedType === "carousel"
          ? `Carousel card ${slideNumber} of ${slideTotal}. Create a distinct real-looking commercial, lifestyle, product, or service image. Do not create a text-only slide or static poster. `
          : count > 1
            ? `Image variation ${slideNumber} of ${slideTotal}. Create a distinct branded visual, not a duplicate and not a text card. `
            : "";

      const prompt = `${creativePrefix}${
        body.imagePrompt ||
        generated?.imagePrompt ||
        body.caption ||
        body.goal ||
        body.offer ||
        `Social post image for ${brand.name}`
      }`;

      const result = await generateImageAsset({
        brand,
        userId,
        prompt,
        platform: body.platform || "facebook",
        aspectRatio: body.aspectRatio || body.imageAspectRatio || "1:1",
        size: body.imageSize || undefined,
        sourceMedia,
        postType: requestedType,
        slideIndex: slideNumber - 1,
        slideCount: slideTotal,
        preferredProvider: normalizeProvider(body.imageProvider, "image"),
        model: body.imageModel || undefined,
      });

      if (!result.ok || !result.fileUrl) {
        return {
          error: result.message || "Image generation failed.",
        };
      }

      const media = await Media.create({
        brand: brand._id,
        uploadedBy: userId,
        fileName:
          result.fileName || `${brand.name} generated image ${slideNumber}`,
        fileUrl: result.fileUrl,
        publicId: result.publicId || result.fileUrl,
        fileType: "image",
        mimeType: result.mimeType || "image/png",
        size: result.size || 0,
        folder: result.folder || "ai-generated",
        tags: [
          result.provider || "ai",
          "generated",
          requestedType === "carousel" ? "carousel-slide" : "post-image",
          jobTag,
          slotTag,
        ],
        aiPrompt: result.aiPrompt,
        aiInsights: {
          summary: `${result.provider || "AI"} generated image for ${brand.name}.`,
          visualPrompt: result.aiPrompt,
          contentAngles: [body.goal, body.offer, body.contentType].filter(
            Boolean,
          ),
          recommendedPlatforms: toArray(
            body.platforms || body.platform || "facebook",
          ),
          safetyNotes: [
            `Generated through ${result.provider || "AI"} image generation. Review before publishing.`,
          ],
          reuseInstructions: [
            "Use this asset in posts for the selected brand and campaign.",
          ],
          generatedFrom: `${result.provider || "ai"}_image_api`,
          generatedAt: new Date(),
        },
        variants: [
          {
            kind: `${result.provider || "ai"}_generated_image`,
            label:
              result.providerModel ||
              `${result.provider || "AI"} generated image`,
            url: result.fileUrl,
            prompt: result.aiPrompt,
            status: "ready",
            metadata: result.metadata || {},
            createdAt: new Date(),
          },
        ],
      });

      return {
        mediaId: media._id,
      };
    },
  );

  return {
    mediaIds: jobs.map((item) => item?.mediaId).filter(Boolean),
    errors: jobs.map((item) => item?.error).filter(Boolean),
  };
}

async function ensureVideoSource({ body, brand, sourceMedia, prompt, userId }) {
  if (sourceMedia?.fileType === "image" && sourceMedia.fileUrl) {
    return sourceMedia;
  }

  const generated = await generateImage({
    preferredProvider: normalizeProvider(body.imageProvider, "image"),
    brand,
    userId,
    prompt: [
      `Create a clean keyframe image for a short promotional video for ${brand.name}.`,
      prompt,
      "Use a real commercial composition, clear subject focus, no tiny text, and leave safe space for captions.",
    ]
      .filter(Boolean)
      .join(" "),
    aspectRatio: body.videoAspectRatio || "9:16",
    size: String(body.videoAspectRatio || "").includes("16:9")
      ? "1536x1024"
      : "1024x1536",
    postType: "video",
  });

  if (!generated.ok || !generated.fileUrl) {
    throw new Error(
      generated.message || "A video keyframe could not be created.",
    );
  }

  return {
    fileUrl: generated.fileUrl,
    fileName: generated.fileName,
    fileType: "image",
    mimeType: generated.mimeType || "image/png",
  };
}

async function createVideoMedia({
  body,
  post,
  brand,
  userId,
  sourceMedia,
  prompt,
  jobId,
}) {
  const keyframe = await ensureVideoSource({
    body,
    brand,
    sourceMedia,
    prompt,
    userId,
  });

  const result = await generateVideo({
    preferredProvider: normalizeProvider(body.videoProvider, "video"),
    brand,
    userId,
    sourceMedia: keyframe,
    prompt,
    aspectRatio: body.videoAspectRatio || "9:16",
    durationSeconds: body.videoDurationSeconds || 8,
    model: body.videoModel || undefined,
  });

  if (!result.ok || !result.outputUrl) {
    throw new Error(
      result.message || "The video renderer did not return a playable MP4.",
    );
  }

  const media = await Media.create({
    brand: brand._id,
    uploadedBy: userId,
    fileName: result.fileName || `${brand.name} generated video.mp4`,
    fileUrl: result.outputUrl,
    publicId: result.publicId || result.providerJobId || result.outputUrl,
    fileType: "video",
    mimeType: result.mimeType || "video/mp4",
    size: result.size || 0,
    folder: result.folder || `${result.provider || "ai"}-generated-video`,
    tags: [
      result.provider || "ai",
      "generated",
      "video",
      "post-video",
      generationJobTag(jobId),
    ],
    aiPrompt: prompt,
    aiInsights: {
      summary: `${result.provider || "AI"} generated video for ${brand.name}.`,
      visualPrompt: prompt,
      recommendedPlatforms: post.platforms?.length
        ? post.platforms
        : [post.platform || "facebook"],
      safetyNotes: [
        result.warning || "Review generated video before publishing.",
      ].filter(Boolean),
      reuseInstructions: [
        "Use this asset in posts for the selected brand and campaign.",
      ],
      generatedFrom: `${result.provider || "ai"}_video_job`,
      generatedAt: new Date(),
    },
    variants: [
      {
        kind: `${result.provider || "ai"}_generated_video`,
        label:
          result.providerModel || `${result.provider || "AI"} generated video`,
        url: result.outputUrl,
        prompt,
        status: "ready",
        metadata: {
          providerJobId: result.providerJobId,
          warning: result.warning || "",
        },
        createdAt: new Date(),
      },
    ],
  });

  return {
    media,
    result,
  };
}

async function connectedTargetsForPost(post) {
  const platforms = [...new Set(toArray(post.platforms?.length ? post.platforms : post.platform || "facebook"))];
  const selectedIds = toArray(post.targetAccounts)
    .map((value) => value?._id || value)
    .filter(Boolean);
  const filter = {
    owner: post.createdBy || post.user,
    brand: post.brand?._id || post.brand,
    platform: trustedOperator({ $in: platforms }),
    status: "connected",
  };
  if (selectedIds.length) filter._id = trustedOperator({ $in: selectedIds });
  const accounts = await SocialAccount.find(filter).lean();
  const now = Date.now();
  const usable = accounts.filter((account) => {
    if (!account.accountId || !account.accessTokenEncrypted) return false;
    if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() <= now) return false;
    if (account.platform === 'instagram' && !account.providerMeta?.permissionGrantVerifiedAt) return false;
    return true;
  });
  const availablePlatforms = new Set(usable.map((account) => account.platform));
  const missingPlatforms = platforms.filter((platform) => !availablePlatforms.has(platform));
  return { accounts: usable, platforms, missingPlatforms };
}

async function finishRequestedAction(post, metadata = {}) {
  const requestedAction = metadata.requestedAction || "save";
  post.platformMetadata = generationMetadata(post, {
    requestedAction,
    actionStatus: "preparing",
    actionError: "",
  });
  post.markModified("platformMetadata");

  if (requestedAction === "save") {
    post.status = "draft";
    post.platformMetadata = generationMetadata(post, {
      actionStatus: "saved",
      actionCompletedAt: new Date(),
    });
    post.markModified("platformMetadata");
    await post.save();
    return { saved: true, dispatched: false };
  }

  const targets = await connectedTargetsForPost(post);
  if (targets.missingPlatforms.length) {
    throw new Error(
      `No live connected destination is available for: ${targets.missingPlatforms.join(", ")}. Reconnect those Facebook/Instagram accounts and select them again.`,
    );
  }

  let scheduledAt;
  if (requestedAction === "schedule") {
    scheduledAt = metadata.scheduledAt ? new Date(metadata.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new Error("The saved schedule time is invalid.");
    }
  } else if (requestedAction === "publish") {
    scheduledAt = new Date();
  } else {
    throw new Error(`Unsupported post action: ${requestedAction}.`);
  }

  post.scheduledAt = scheduledAt;
  post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
  post.publishingStartedAt = undefined;
  post.publishingAttemptId = "";

  if (post.approvalRequired) {
    post.status = "pending_approval";
    post.platformMetadata = generationMetadata(post, {
      actionStatus: "pending_approval",
      actionCompletedAt: new Date(),
    });
    post.markModified("platformMetadata");
    await post.save();
    return { pendingApproval: true, dispatched: false };
  }

  post.status = "scheduled";
  post.platformMetadata = generationMetadata(post, {
    actionStatus: "scheduled",
    actionScheduledAt: scheduledAt,
  });
  post.markModified("platformMetadata");
  await post.save();

  const dispatch = await dispatchScheduledPost(post, {
    userId: post.createdBy || post.user || undefined,
  });
  post.platformMetadata = generationMetadata(post, {
    actionStatus: "dispatched",
    actionDispatchedAt: new Date(),
    queueAccepted: Boolean(dispatch?.queued),
    databaseFallbackActive: !dispatch?.queued,
    queueError: dispatch?.queueError?.message || "",
  });
  post.markModified("platformMetadata");
  await post.save();

  console.log("[generation] post handed to publishing", {
    postId: cleanObjectId(post._id),
    action: requestedAction,
    platforms: targets.platforms,
    targetCount: targets.accounts.length,
    scheduledAt: scheduledAt.toISOString(),
    queueAccepted: Boolean(dispatch?.queued),
    databaseFallbackActive: !dispatch?.queued,
  });
  return { dispatched: true, dispatch };
}

async function chargeGeneration({
  job,
  post,
  user,
  brand,
  body,
  generated,
  mediaGenerated,
  provider,
}) {
  if ((!generated && !mediaGenerated) || job.metadata?.creditsChargedAt) {
    return;
  }

  const existingUsage = await UsageLog.findOne({
    user: user._id,
    action: trustedOperator({
      $in: ["ai_generate_content", "ai_generate_media"],
    }),
    "metadata.job": job._id,
  }).lean();

  if (existingUsage) {
    job.metadata = {
      ...(job.metadata || {}),
      creditsChargedAt: existingUsage.createdAt || new Date(),
      generationCredits: existingUsage.credits || 0,
    };

    await job.save();
    return;
  }

  const selectedPlatforms = toArray(
    body.platforms || body.platform || post.platform || "facebook",
  );

  const generationControls = normalizeGenerationControls({
    ...body,
    platforms: selectedPlatforms,
    outputType: generated?.generatedBundle?.outputType || body.outputType,
  });

  const generationCredits = creditsForGeneration(generationControls);

  await spendCredits({
    user,
    amount: generationCredits,
    reason: `Composer ${generationControls.outputType} generation`,
    referenceType: "Post",
    referenceId: post._id,
  });

  await UsageLog.create({
    user: user._id,
    brand: brand._id,
    action: generated ? "ai_generate_content" : "ai_generate_media",
    provider: generated?.provider || provider || job.provider,
    credits: generationCredits,
    metadata: {
      post: post._id,
      job: job._id,
      controls: generationControls,
      outputType: generationControls.outputType,
      mediaGenerated,
    },
  });

  job.metadata = {
    ...(job.metadata || {}),
    creditsChargedAt: new Date(),
    generationCredits,
  };

  await job.save();
}

async function recordGeneratedMediaUsage({
  job,
  brand,
  generatedImageIds = [],
  provider,
}) {
  if (!generatedImageIds.length) {
    return;
  }

  const existing = await UsageLog.exists({
    user: job.user,
    action: "ai_generate_image",
    "metadata.job": job._id,
  });

  if (existing) {
    return;
  }

  await UsageLog.create({
    user: job.user,
    brand: brand._id,
    action: "ai_generate_image",
    provider: provider || job.provider || "ai",
    credits: 0,
    metadata: {
      job: job._id,
      count: generatedImageIds.length,
      media: generatedImageIds,
      source: "post_generation_worker",
    },
  });
}

async function processPostGenerationJob(job) {
  const rawMetadata = job.metadata || {};

  const post = await Post.findOne({
    _id: rawMetadata.postId,
    createdBy: job.user,
  });

  if (!post) {
    throw new Error("The post for this generation job no longer exists.");
  }

  if (post.status === "cancelled") {
    job.status = "cancelled";
    job.completedAt = new Date();

    await job.save();
    return;
  }

  const [brand, user] = await Promise.all([
    Brand.findOne({
      _id: post.brand,
      owner: job.user,
      status: "active",
    }),
    User.findById(job.user),
  ]);

  if (!brand) {
    throw new Error("The brand for this generation job is unavailable.");
  }

  if (!user) {
    throw new Error("The account for this generation job is unavailable.");
  }

  const metadata = normalizeJobMetadata(job, post);

  const body = metadata.body || {};

  const selectedRowsRaw = metadata.selectedMediaIds?.length
    ? await Media.find({
        _id: trustedOperator({
          $in: metadata.selectedMediaIds,
        }),
        uploadedBy: job.user,
        status: trustedOperator({
          $ne: "archived",
        }),
      })
    : [];

  const selectedAvailability = await partitionAvailableMedia(selectedRowsRaw);
  const selectedRows = selectedAvailability.available;
  if (selectedAvailability.missing.length) {
    await archiveMissingGeneratedMedia(selectedAvailability.missing, {
      reason: "Selected media file is missing from storage and cannot be reused.",
    });
    console.warn("[generation] ignored missing selected media", {
      jobId: cleanObjectId(job._id),
      postId: cleanObjectId(post._id),
      missing: selectedAvailability.missing.map((item) => item.fileUrl),
    });
  }

  const artifactFilters = [
    {
      tags: generationJobTag(job._id),
    },
  ];

  if (metadata.generatedMediaIds?.length) {
    artifactFilters.push({
      _id: trustedOperator({
        $in: metadata.generatedMediaIds,
      }),
    });
  }

  const artifactRowsRaw = await Media.find({
    uploadedBy: job.user,
    status: trustedOperator({
      $ne: "archived",
    }),
    $or: artifactFilters,
  });

  const artifactAvailability = await partitionAvailableMedia(artifactRowsRaw);
  const artifactRows = artifactAvailability.available;
  if (artifactAvailability.missing.length) {
    await archiveMissingGeneratedMedia(artifactAvailability.missing, {
      reason: "Recovered generation artifact no longer exists on storage; regenerate it instead of reusing a broken database record.",
    });
    job.metadata = {
      ...(job.metadata || {}),
      generatedMediaIds: (job.metadata?.generatedMediaIds || []).filter((id) => {
        const key = cleanObjectId(id);
        return !artifactAvailability.missing.some((item) => cleanObjectId(item.row?._id) === key);
      }),
      staleMediaRecoveredAt: new Date(),
    };
    job.markModified?.("metadata");
    await job.save();
    console.warn("[generation] stale generated media will be regenerated", {
      jobId: cleanObjectId(job._id),
      postId: cleanObjectId(post._id),
      missing: artifactAvailability.missing.map((item) => item.fileUrl),
    });
  }

  // Rebuild the plan from media that really exists. Persisted plans can contain
  // local file IDs from an earlier process or deployment; trusting those IDs is
  // what caused recovered posts to reuse 404 media forever.
  const plan = buildPostGenerationPlan(body, selectedRows, brand);

  let sourceMedia =
    selectedRows.find(
      (media) => cleanObjectId(media._id) === plan.sourceImageId,
    ) ||
    selectedRows.find((media) => media.fileType === "image") ||
    null;

  post.platformMetadata = generationMetadata(post, {
    status: "running",
    stage: "content",
    jobId: job._id,
    startedAt: job.startedAt || new Date(),
    error: "",
  });

  post.markModified("platformMetadata");
  await post.save();

  let generated = null;

  if (plan.needsText) {
    generated = await generatePostIdea({
      brand,
      platform: body.platform || post.platform || "facebook",
      platforms: toArray(
        body.platforms || body.platform || post.platform || "facebook",
      ),
      goal: [body.goal, body.offer, body.audience].filter(Boolean).join(" | "),
      contentType: body.contentType || "promo",
      outputType: body.outputType,
      tone: body.toneOverride || body.tone,
      audience: body.audience,
      length: body.length,
      emojiLevel: body.emojiLevel,
      hashtagCount: body.hashtagCount,
      ctaType: body.ctaStyle,
      language: body.language,
      sourceMedia,
    });
  }

  const caption = String(
    body.caption || generated?.caption || post.caption || "",
  ).trim();

  if (!caption) {
    throw new Error("AI generation did not return a caption.");
  }

  let generatedImageIds = artifactRows
    .filter((media) => media.fileType === "image")
    .map((media) => media._id);

  let imageErrors = [];

  const existingImageCount =
    (plan.existingImageIds?.length || 0) + generatedImageIds.length;

  const remainingImageCount = plan.isImage
    ? Math.max(0, Number(plan.targetImageCount || 0) - existingImageCount)
    : 0;

  if (remainingImageCount > 0) {
    post.platformMetadata = generationMetadata(post, {
      status: "running",
      stage: "images",
      jobId: job._id,
    });

    post.markModified("platformMetadata");
    await post.save();

    const imageOutput = await createImageMedia({
      body: {
        ...body,
        caption,
        imageCount: plan.targetImageCount,
        __existingImageCount: existingImageCount,
      },
      brand,
      userId: job.user,
      sourceMedia,
      generated,
      count: remainingImageCount,
      jobId: job._id,
    });

    generatedImageIds = dedupeIds([
      ...generatedImageIds,
      ...imageOutput.mediaIds,
    ]);

    imageErrors = imageOutput.errors;

    job.metadata = {
      ...(job.metadata || {}),
      generatedMediaIds: dedupeIds([
        ...(job.metadata?.generatedMediaIds || []),
        ...imageOutput.mediaIds,
      ]).map(cleanObjectId),
    };

    await job.save();

    const completedImageCount =
      (plan.existingImageIds?.length || 0) + generatedImageIds.length;

    if (completedImageCount < Number(plan.targetImageCount || 0)) {
      const selectedPlatforms = toArray(
        body.platforms || body.platform || post.platform || "facebook",
      );
      const generationMessage =
        imageErrors[0] ||
        `Only ${completedImageCount} of ${plan.targetImageCount} requested images were generated.`;

      if (completedImageCount >= 2 && plan.type === "carousel") {
        plan.targetImageCount = completedImageCount;
        imageErrors.push(
          `${generationMessage} The carousel will use the ${completedImageCount} completed images.`,
        );
      } else if (completedImageCount >= 1) {
        plan.type = "image";
        plan.isImage = true;
        plan.targetImageCount = 1;
        body.type = "image";
        body.mediaPreset = "image-1";
        body.mediaFormat = "text_image";
        post.type = "image";
        imageErrors.push(
          `${generationMessage} The post was safely reduced to one image.`,
        );
      } else if (platformsAllowTextOnly(selectedPlatforms) && caption) {
        plan.type = "text";
        plan.isImage = false;
        plan.targetImageCount = 0;
        body.type = "text";
        body.mediaPreset = "text";
        body.mediaFormat = "text_only";
        post.type = "text";
        generatedImageIds = [];
        imageErrors.push(
          `${generationMessage} The post was converted to text-only so publishing can continue.`,
        );
      } else {
        throw new Error(
          `${generationMessage} ${selectedPlatforms.join(", ")} requires usable media; upload media or configure a working image provider.`,
        );
      }
    }

    if (!sourceMedia && generatedImageIds.length) {
      sourceMedia = await Media.findById(generatedImageIds[0]);
    }
  }

  let finalMediaIds = [];
  let videoResult = null;

  if (plan.needsVideo) {
    post.platformMetadata = generationMetadata(post, {
      status: "running",
      stage: "video",
      jobId: job._id,
    });

    post.markModified("platformMetadata");
    await post.save();

    const persistedVideo = artifactRows.find(
      (media) => media.fileType === "video",
    );

    if (persistedVideo) {
      finalMediaIds = [persistedVideo._id];

      videoResult = job.metadata?.videoResult || {
        provider: job.provider || "ai",
        outputUrl: persistedVideo.fileUrl,
      };
    } else {
      const videoPrompt =
        body.videoPrompt ||
        body.videoScript ||
        generated?.videoScript ||
        generated?.caption ||
        caption;

      try {
        const output = await createVideoMedia({
          body,
          post,
          brand,
          userId: job.user,
          sourceMedia,
          prompt: videoPrompt,
          jobId: job._id,
        });

        finalMediaIds = [output.media._id];
        videoResult = output.result;

        job.metadata = {
          ...(job.metadata || {}),
          generatedMediaIds: dedupeIds([
            ...(job.metadata?.generatedMediaIds || []),
            output.media._id,
          ]).map(cleanObjectId),
          videoResult: {
            provider: output.result.provider || "",
            providerModel: output.result.providerModel || "",
            providerJobId: output.result.providerJobId || "",
            outputUrl: output.result.outputUrl || "",
            warning: output.result.warning || "",
          },
        };

        await job.save();
      } catch (error) {
        const selectedPlatforms = toArray(
          body.platforms || body.platform || post.platform || "facebook",
        );
        const sourceMediaId = sourceMedia?._id ? cleanObjectId(sourceMedia._id) : "";
        const warning = error.message || "Video generation failed.";

        if (sourceMediaId && sourceMedia?.fileType === "image" && platformsAllowImages(selectedPlatforms)) {
          plan.needsVideo = false;
          plan.isVideo = false;
          plan.isImage = true;
          plan.type = "image";
          body.type = "image";
          body.mediaPreset = "image-1";
          body.mediaFormat = "text_image";
          post.type = "image";
          finalMediaIds = [sourceMediaId];
          videoResult = { warning: `${warning} The uploaded source image will be published instead.` };
        } else if (platformsAllowTextOnly(selectedPlatforms) && caption) {
          plan.needsVideo = false;
          plan.isVideo = false;
          plan.isImage = false;
          plan.type = "text";
          body.type = "text";
          body.mediaPreset = "text";
          body.mediaFormat = "text_only";
          post.type = "text";
          finalMediaIds = [];
          videoResult = { warning: `${warning} The post was converted to text-only so publishing can continue.` };
        } else {
          throw new Error(`${warning} ${selectedPlatforms.join(", ")} requires usable video media; upload a video or configure a working video provider.`);
        }
      }
    }
  } else if (plan.isVideo) {
    finalMediaIds = dedupeIds(plan.existingVideoIds || []);
  } else if (plan.isImage) {
    finalMediaIds = dedupeIds([
      ...(plan.existingImageIds || []),
      ...generatedImageIds,
    ]).slice(0, plan.targetImageCount || 5);
  }

  const cancelledPost = await Post.findOne({
    _id: post._id,
    createdBy: job.user,
    status: "cancelled",
  })
    .select("_id")
    .lean();

  if (cancelledPost) {
    job.status = "cancelled";
    job.completedAt = new Date();
    job.error = "";
    job.result = {
      ...(job.result || {}),
      postId: post._id,
      mediaIds: finalMediaIds,
      cancelled: true,
    };

    await job.save();
    return;
  }

  const selectedPlatforms = [
    ...new Set(
      toArray(body.platforms || body.platform || post.platform || "facebook"),
    ),
  ];

  const baseContent = {
    title: body.title || generated?.title || post.title || `${brand.name} post`,
    description:
      body.description || generated?.description || post.description || "",
    caption,
    hashtags: splitHashtags(
      body.hashtags || generated?.hashtags || brand.preferredHashtags || [],
    ),
    firstComment: body.firstComment || post.firstComment || "",
    altText: body.altText || post.altText || "",
    thumbnail: body.thumbnail || post.thumbnail || "",
    videoTitle:
      body.videoTitle ||
      body.title ||
      generated?.title ||
      post.videoTitle ||
      "",
    videoDescription:
      body.videoDescription ||
      body.description ||
      generated?.description ||
      post.videoDescription ||
      "",
    shortVideoHook: body.shortVideoHook || post.shortVideoHook || "",
    ctaStyle:
      body.ctaStyle ||
      brand.ctaStyle ||
      brand.preferredCta ||
      post.ctaStyle ||
      "",
    toneOverride: body.toneOverride || post.toneOverride || "",
    type: body.type || post.type,
    link: body.link || post.link || "",
    mediaCount: finalMediaIds.length,
  };

  const variationAccounts = post.targetAccounts?.length
    ? await SocialAccount.find({
        _id: trustedOperator({
          $in: post.targetAccounts,
        }),
        owner: job.user,
      }).lean()
    : [];

  const platformVariations = await createPlatformVariations({
    baseContent,
    brand,
    platforms: selectedPlatforms,
    accounts: variationAccounts,
  });

  const finalMediaRows = finalMediaIds.length
    ? await Media.find({
        _id: trustedOperator({
          $in: finalMediaIds,
        }),
        uploadedBy: job.user,
        status: trustedOperator({ $ne: "archived" }),
      })
    : [];
  const finalAvailability = await partitionAvailableMedia(finalMediaRows);
  if (finalAvailability.missing.length) {
    await archiveMissingGeneratedMedia(finalAvailability.missing, {
      reason: "Generated media disappeared before post finalization.",
    });
    finalMediaIds = finalAvailability.available.map((media) => media._id);
    const warning = `Removed ${finalAvailability.missing.length} missing media file(s) before publishing.`;
    imageErrors.push(warning);
    if (!finalMediaIds.length && platformsAllowTextOnly(selectedPlatforms) && caption) {
      plan.needsVideo = false;
      plan.isVideo = false;
      plan.isImage = false;
      plan.type = "text";
      body.type = "text";
      body.mediaPreset = "text";
      body.mediaFormat = "text_only";
      post.type = "text";
      baseContent.type = "text";
      baseContent.mediaCount = 0;
      imageErrors.push("The post was converted to text-only because its generated media was unavailable.");
    } else if (!finalMediaIds.length && (plan.isImage || plan.isVideo)) {
      throw new Error("Generated media is missing from storage. The post was not sent to Facebook or Instagram with a broken file.");
    }
  }
  const finalMediaDocs = finalAvailability.available.map((media) =>
    typeof media.toObject === "function" ? media.toObject() : media,
  );

  const composerWarnings = await validateComposerSubmission({
    ...baseContent,
    platform: post.platform,
    platforms: selectedPlatforms,
    media: finalMediaDocs,
    link: baseContent.link,
  });

  const validationWarnings = [
    ...new Set(
      platformVariations
        .flatMap((item) => item.validationWarnings || [])
        .concat(composerWarnings),
    ),
  ];

  const average = (field) =>
    Math.round(
      platformVariations.reduce(
        (total, item) => total + Number(item[field] || 0),
        0,
      ) / Math.max(platformVariations.length, 1) || 0,
    );

  post.title = baseContent.title;
  post.description = baseContent.description;
  post.caption = caption;
  post.hashtags = baseContent.hashtags;
  post.firstComment = baseContent.firstComment;
  post.altText = baseContent.altText;
  post.thumbnail = baseContent.thumbnail;
  post.videoTitle = baseContent.videoTitle;
  post.videoDescription = baseContent.videoDescription;
  post.shortVideoHook = baseContent.shortVideoHook;
  post.ctaStyle = baseContent.ctaStyle;
  post.toneOverride = baseContent.toneOverride;
  post.platformVariations = platformVariations;
  post.validationWarnings = validationWarnings;
  post.contentScore = average("contentScore");
  post.brandFitScore = average("brandFitScore");
  post.riskScore = average("riskScore");
  post.media = finalMediaIds;
  post.errorMessage = "";

  post.platformMetadata = {
    ...(post.platformMetadata || {}),
    ...buildCreativePlan(body, brand, sourceMedia, generated),
    selectedPlatforms,
    imageWarning: imageErrors.join(" | "),
    videoWarning: videoResult?.warning || "",
    generation: {
      ...(post.platformMetadata?.generation || {}),
      status: "ready",
      stage: "complete",
      jobId: job._id,
      provider: videoResult?.provider || generated?.provider || "",
      providerModel: videoResult?.providerModel || "",
      providerJobId: videoResult?.providerJobId || "",
      warning: [videoResult?.warning, imageErrors.join(" | ")]
        .filter(Boolean)
        .join(" | "),
      completedAt: new Date(),
      error: "",
      updatedAt: new Date(),
    },
  };

  post.markModified("platformMetadata");
  await post.save();

  let actionWarning = "";

  // Publishing/scheduling is the user's primary action. Do it before usage
  // bookkeeping so a CreditLedger/UsageLog/notification write cannot leave a
  // fully generated post stranded as a draft.
  try {
    await finishRequestedAction(post, metadata);
  } catch (error) {
    actionWarning =
      error.message ||
      "Generation finished, but the requested publish action failed.";

    post.status = "failed";
    post.errorMessage = actionWarning;
    post.platformMetadata = generationMetadata(post, {
      status: "ready",
      actionStatus: "failed",
      actionError: actionWarning,
      actionFailedAt: new Date(),
    });

    post.markModified("platformMetadata");
    await post.save();
    console.error("[generation] publish handoff failed", {
      jobId: cleanObjectId(job._id),
      postId: cleanObjectId(post._id),
      action: metadata.requestedAction || "save",
      message: actionWarning,
    });
  }

  const auxiliaryWarnings = [];
  try {
    await chargeGeneration({
      job,
      post,
      user,
      brand,
      body,
      generated,
      mediaGenerated: generatedImageIds.length + (videoResult ? 1 : 0),
      provider: videoResult?.provider || generated?.provider || job.provider,
    });
  } catch (error) {
    const message = `Generation usage charge could not be recorded: ${error.message}`;
    auxiliaryWarnings.push(message);
    console.error("[generation] usage charge failed after content completion", {
      jobId: cleanObjectId(job._id),
      postId: cleanObjectId(post._id),
      message: error.message,
    });
  }

  try {
    await recordGeneratedMediaUsage({
      job,
      brand,
      generatedImageIds,
      provider: generated?.provider || job.provider,
    });
  } catch (error) {
    const message = `Generated-media usage could not be recorded: ${error.message}`;
    auxiliaryWarnings.push(message);
    console.error("[generation] media usage record failed", {
      jobId: cleanObjectId(job._id),
      postId: cleanObjectId(post._id),
      message: error.message,
    });
  }

  job.status = "completed";
  job.result = {
    postId: post._id,
    mediaIds: finalMediaIds,
    outputUrl: videoResult?.outputUrl || "",
    provider: videoResult?.provider || generated?.provider || "",
    warning: [
      videoResult?.warning,
      imageErrors.join(" | "),
      actionWarning,
      ...auxiliaryWarnings,
    ]
      .filter(Boolean)
      .join(" | "),
  };
  job.completedAt = new Date();
  job.error = "";

  await job.save();

  await notify(job.user, {
    type: actionWarning ? "post_publish_action_failed" : "post_generation_ready",
    title: actionWarning
      ? "Post generated but not published"
      : metadata.requestedAction === "publish"
        ? "Post sent to publishing"
        : plan.needsVideo
          ? "Video ready"
          : "Post ready",
    message: actionWarning
      ? `${post.title || brand.name} finished generating, but its requested publish action needs attention: ${actionWarning}`
      : metadata.requestedAction === "publish"
        ? `${post.title || brand.name} finished generating and was handed to the live publishing worker.`
        : `${post.title || brand.name} finished generating and is visible in Content Library.`,
    severity:
      videoResult?.warning ||
      imageErrors.length ||
      actionWarning ||
      auxiliaryWarnings.length
        ? "warning"
        : "success",
    postId: post._id,
    metadata: {
      job: job._id,
      warning: [
        videoResult?.warning,
        imageErrors.join(" | "),
        actionWarning,
        ...auxiliaryWarnings,
      ]
        .filter(Boolean)
        .join(" | "),
    },
  });
}

async function markJobFailure(job, error) {
  const cancelled = await AiJob.exists({
    _id: job._id,
    status: "cancelled",
  });

  if (cancelled) {
    return;
  }

  const message = error.message || "Post generation failed.";

  const nextRetries = Number(job.retries || 0) + 1;

  const shouldRetry = nextRetries <= MAX_RETRIES;

  const nextAttemptAt = shouldRetry
    ? new Date(Date.now() + Math.min(120000, 15000 * 2 ** (nextRetries - 1)))
    : null;

  job.retries = nextRetries;
  job.error = message;
  job.completedAt = shouldRetry ? undefined : new Date();
  job.status = shouldRetry ? "queued" : "failed";

  job.metadata = {
    ...(job.metadata || {}),
    nextAttemptAt,
    lastErrorAt: new Date(),
  };

  await job.save();

  const post = await Post.findOne({
    _id: job.metadata?.postId,
    createdBy: job.user,
  });

  if (!post) {
    return;
  }

  post.errorMessage = shouldRetry ? "" : message;

  post.platformMetadata = generationMetadata(post, {
    status: shouldRetry ? "queued" : "failed",
    jobId: job._id,
    error: message,
    retries: nextRetries,
    nextAttemptAt,
    failedAt: shouldRetry ? undefined : new Date(),
  });

  post.markModified("platformMetadata");
  await post.save();

  if (!shouldRetry) {
    await notify(job.user, {
      type: "post_generation_failed",
      title: "Post generation failed",
      message,
      severity: "error",
      postId: post._id,
    });
  }
}

function laneFilter(lane) {
  if (lane === "video") {
    return {
      $or: [
        {
          taskType: LEGACY_VIDEO_TASK_TYPE,
        },
        {
          taskType: TASK_TYPE,
          "metadata.plan.needsVideo": true,
        },
      ],
    };
  }

  return {
    taskType: TASK_TYPE,
    "metadata.plan.needsVideo": trustedOperator({
      $ne: true,
    }),
  };
}

async function claimNextJob(lane) {
  const now = new Date();

  return AiJob.findOneAndUpdate(
    {
      status: "queued",
      $and: [
        laneFilter(lane),
        {
          $or: [
            {
              "metadata.nextAttemptAt": trustedOperator({
                $exists: false,
              }),
            },
            {
              "metadata.nextAttemptAt": null,
            },
            {
              "metadata.nextAttemptAt": trustedOperator({
                $lte: now,
              }),
            },
          ],
        },
      ],
    },
    {
      $set: {
        status: "running",
        startedAt: now,
        error: "",
      },
    },
    {
      new: true,
      sort: {
        priority: 1,
        createdAt: 1,
      },
    },
  );
}

async function runClaimedJob(job) {
  try {
    await processPostGenerationJob(job);
  } catch (error) {
    await markJobFailure(job, error);
  }
}

async function fillWorkerLane(lane, limit) {
  while (activeWorkers[lane] < limit) {
    const job = await claimNextJob(lane);

    if (!job) {
      break;
    }

    activeWorkers[lane] += 1;

    runClaimedJob(job)
      .catch((error) => {
        console.error(`AI ${lane} worker job failed:`, error);
      })
      .finally(() => {
        activeWorkers[lane] -= 1;
      });
  }
}

async function tick() {
  if (stopped || tickRunning) {
    return;
  }

  if (!generationMongoBackoff.canAttempt()) {
    return;
  }
  if (!isMongoReady()) {
    generationMongoBackoff.recordFailure(mongoUnavailableError());
    return;
  }

  tickRunning = true;

  try {
    const now = Date.now();
    if (now - lastActionRecoveryAt >= ACTION_RECOVERY_INTERVAL_MS) {
      lastActionRecoveryAt = now;
      await recoverCompletedJobsWithMissingMedia().catch((error) => {
        if (isMongoConnectivityError(error)) throw error;
        console.error("AI generation media recovery failed:", error.message);
      });
      await recoverCompletedGenerationActions().catch((error) => {
        if (isMongoConnectivityError(error)) throw error;
        console.error("AI generation action recovery failed:", error.message);
      });
    }
    await Promise.all([
      fillWorkerLane("content", env.aiContentGenerationConcurrency),
      fillWorkerLane("video", env.aiVideoGenerationConcurrency),
    ]);
    if (generationMongoBackoff.recordSuccess()) {
      console.log("[runtime] MongoDB recovered; AI generation resumed.");
    }
  } catch (error) {
    if (isMongoConnectivityError(error)) {
      generationMongoBackoff.recordFailure(error);
      return;
    }
    throw error;
  } finally {
    tickRunning = false;
  }
}

/**
 * Recovers generation jobs that were left in the running state after a
 * process crash, deployment, machine restart, or interrupted worker.
 *
 * This intentionally uses AiJob.collection.updateMany() instead of the
 * Mongoose model updateMany() method. The query is fully created by this
 * backend service and contains no user-controlled values.
 *
 * Using the native collection prevents global Mongoose sanitizeFilter
 * processing from changing:
 *
 *   startedAt: { $lt: staleBefore }
 *
 * into a literal date equality value, which caused:
 *
 *   Cast to date failed for value "{ '$lt': ... }"
 */
async function recoverPreviouslyFailedJobs() {
  const now = new Date();
  const result = await AiJob.collection.updateMany(
    {
      taskType: { $in: TASK_TYPES },
      status: "failed",
      "metadata.runtimeRecoveryVersion": { $ne: RUNTIME_RECOVERY_VERSION },
    },
    {
      $set: {
        status: "queued",
        retries: 0,
        completedAt: null,
        error: "Recovered after publishing runtime repair.",
        "metadata.nextAttemptAt": now,
        "metadata.runtimeRecoveryVersion": RUNTIME_RECOVERY_VERSION,
        "metadata.runtimeRecoveredAt": now,
        updatedAt: now,
      },
    },
  );

  return {
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
  };
}

async function recoverStaleJobs() {
  const now = new Date();

  const staleBefore = new Date(now.getTime() - RUNNING_STALE_MS);

  const result = await AiJob.collection.updateMany(
    {
      taskType: {
        $in: TASK_TYPES,
      },
      status: "running",
      startedAt: {
        $lt: staleBefore,
      },
    },
    {
      $set: {
        status: "queued",
        "metadata.nextAttemptAt": now,
        error: "Recovered after an interrupted worker process.",
        updatedAt: now,
      },
      $inc: {
        retries: 1,
      },
    },
  );

  return {
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
  };
}

async function recoverCompletedJobsWithMissingMedia({ limit = 50 } = {}) {
  const jobs = await AiJob.find({
    taskType: trustedOperator({ $in: TASK_TYPES }),
    status: "completed",
    "metadata.postId": trustedOperator({ $exists: true }),
    "metadata.requestedAction": trustedOperator({ $in: ["publish", "schedule"] }),
  })
    .sort({ completedAt: -1, updatedAt: -1 })
    .limit(limit);

  let requeued = 0;
  for (const job of jobs) {
    const resultMediaIds = dedupeIds(job.result?.mediaIds || []).map(cleanObjectId).filter(Boolean);
    const post = await Post.findOne({
      _id: job.metadata?.postId,
      createdBy: job.user,
    }).populate("media");
    if (!post) continue;

    const resultRows = resultMediaIds.length
      ? await Media.find({ _id: trustedOperator({ $in: resultMediaIds }) })
      : [];
    const resultAvailability = await partitionAvailableMedia(resultRows);
    const foundIds = new Set(resultRows.map((row) => cleanObjectId(row._id)));
    const missingDatabaseIds = resultMediaIds.filter((id) => !foundIds.has(id));

    const postRows = (post.media || []).filter(Boolean);
    const postAvailability = await partitionAvailableMedia(postRows);
    const body = job.metadata?.body || {};
    const requestedType = String(body.type || post.type || "text").toLowerCase();
    const expectedGeneratedMedia = resultMediaIds.length > 0
      || Boolean(job.metadata?.plan?.needsVideo)
      || Number(job.metadata?.plan?.imagesToGenerate || 0) > 0;
    const requiredAvailableCount = requestedType === "carousel"
      ? 2
      : ["image", "video"].includes(requestedType)
        ? 1
        : 0;
    const outputMissing = resultAvailability.missing.length > 0
      || missingDatabaseIds.length > 0
      || (expectedGeneratedMedia && requiredAvailableCount > 0 && postAvailability.available.length < requiredAvailableCount);

    if (!outputMissing) continue;

    await archiveMissingGeneratedMedia([
      ...resultAvailability.missing,
      ...postAvailability.missing,
    ], {
      reason: "The generated output disappeared from local storage and is being regenerated.",
    });

    const availableIds = dedupeIds(postAvailability.available.map((row) => row._id));
    post.media = availableIds;
    post.status = "draft";
    post.errorMessage = "";
    post.platformMetadata = generationMetadata(post, {
      status: "queued",
      stage: "storage_recovery",
      actionStatus: "queued",
      actionError: "",
      storageRecoveryAt: new Date(),
      storageRecoveryReason: "Generated media was missing from storage and has been queued for regeneration.",
    });
    post.markModified("platformMetadata");
    await post.save();

    job.status = "queued";
    job.error = "Generated media was missing from storage; regeneration was queued.";
    job.startedAt = undefined;
    job.completedAt = undefined;
    job.metadata = {
      ...(job.metadata || {}),
      nextAttemptAt: new Date(),
      storageRecoveryAt: new Date(),
      storageRecoveryMissingMediaIds: [...new Set([
        ...resultAvailability.missing.map((item) => cleanObjectId(item.row?._id)).filter(Boolean),
        ...missingDatabaseIds,
      ])],
    };
    job.markModified?.("metadata");
    await job.save();
    requeued += 1;

    console.warn("[generation] missing generated media requeued", {
      jobId: cleanObjectId(job._id),
      postId: cleanObjectId(post._id),
      missingMediaIds: job.metadata.storageRecoveryMissingMediaIds,
    });
  }

  return { requeued };
}

async function recoverCompletedGenerationActions({ limit = 50 } = {}) {
  const jobs = await AiJob.find({
    taskType: trustedOperator({ $in: TASK_TYPES }),
    status: "completed",
    "metadata.requestedAction": trustedOperator({ $in: ["publish", "schedule"] }),
  })
    .sort({ completedAt: 1, updatedAt: 1 })
    .limit(limit);

  let recovered = 0;
  let failed = 0;

  for (const job of jobs) {
    const post = await Post.findOne({
      _id: job.metadata?.postId,
      createdBy: job.user,
    });
    if (!post) continue;

    const generation = post.platformMetadata?.generation || {};
    if (generation.status !== "ready") continue;
    if (["dispatched", "pending_approval"].includes(String(generation.actionStatus || ""))) continue;
    if (["scheduled", "publishing", "published", "pending_approval"].includes(post.status)) continue;

    try {
      await finishRequestedAction(post, job.metadata || {});
      recovered += 1;
    } catch (error) {
      failed += 1;
      post.status = "failed";
      post.errorMessage = error.message || "Generated post could not be handed to publishing.";
      post.platformMetadata = generationMetadata(post, {
        status: "ready",
        actionStatus: "failed",
        actionError: post.errorMessage,
        actionFailedAt: new Date(),
        actionRecoveryAttemptedAt: new Date(),
      });
      post.markModified("platformMetadata");
      await post.save().catch(() => {});
      console.error("[generation] recovered publish handoff failed", {
        jobId: cleanObjectId(job._id),
        postId: cleanObjectId(post._id),
        message: post.errorMessage,
      });
    }
  }

  if (recovered || failed) {
    console.log("[generation] completed-action recovery", { recovered, failed });
  }
  return { recovered, failed };
}

async function enqueuePostGeneration({
  post,
  brand,
  userId,
  body,
  selectedMediaIds,
  plan,
  requestedAction,
  scheduledAt,
}) {
  const existing = await AiJob.findOne({
    taskType: trustedOperator({
      $in: TASK_TYPES,
    }),
    user: userId,
    "metadata.postId": cleanObjectId(post._id),
    status: trustedOperator({
      $in: ["queued", "running"],
    }),
  }).sort({
    createdAt: -1,
  });

  if (existing) {
    return existing;
  }

  return AiJob.create({
    user: userId,
    brand: brand._id,
    taskType: TASK_TYPE,
    provider: plan?.needsVideo
      ? normalizeProvider(body.videoProvider, "video") ||
        activeProvider("video") ||
        "local"
      : activeProvider("text") || "local",
    model: plan?.needsVideo ? body.videoModel || "" : body.aiModel || "",
    status: "queued",
    priority: plan?.needsVideo ? 4 : plan?.imagesToGenerate > 0 ? 2 : 1,
    metadata: {
      postId: cleanObjectId(post._id),
      body,
      selectedMediaIds: dedupeIds(selectedMediaIds || []).map(cleanObjectId),
      plan,
      requestedAction: requestedAction || "save",
      scheduledAt: scheduledAt || null,
      queuedAt: new Date(),
    },
  });
}

async function startPostGenerationWorker({ keepAlive = false } = {}) {
  if (!env.aiGenerationWorkerEnabled || timer) {
    return timer;
  }

  stopped = false;

  timer = setInterval(() => {
    tick().catch((error) => {
      console.error("AI generation worker tick failed:", error);
    });
  }, env.aiGenerationPollMs);

  unsubscribeMongoReady = onMongoReady(() => {
    const recovered = generationMongoBackoff.recordSuccess();
    if (recovered) console.log("[runtime] MongoDB reconnected; AI generation wake-up requested.");
    setTimeout(() => tick().catch((error) => console.error("AI generation recovery tick failed:", error.message)), 0).unref?.();
  });

  if (!keepAlive) {
    timer.unref?.();
  }

  // Recovery and the first provider call must never block HTTP startup. A stale
  // generation job may involve a slow or unavailable external provider, so run
  // the initial sweep after the event loop can start accepting requests.
  const startupTimer = setTimeout(async () => {
    try {
      if (!isMongoReady()) {
        generationMongoBackoff.recordFailure(mongoUnavailableError());
        return;
      }
      const [failedRecovery, staleRecovery] = await Promise.all([
        recoverPreviouslyFailedJobs(),
        recoverStaleJobs(),
      ]);
      const mediaRecovery = await recoverCompletedJobsWithMissingMedia();
      const actionRecovery = await recoverCompletedGenerationActions();
      if (failedRecovery.modifiedCount || staleRecovery.modifiedCount || mediaRecovery.requeued || actionRecovery.recovered || actionRecovery.failed) {
        console.log("AI generation recovery completed.", {
          failedJobsRequeued: failedRecovery.modifiedCount,
          staleJobsRequeued: staleRecovery.modifiedCount,
          missingMediaJobsRequeued: mediaRecovery.requeued,
          publishActionsRecovered: actionRecovery.recovered,
          publishActionsFailed: actionRecovery.failed,
        });
      }
      await tick();
    } catch (error) {
      if (isMongoConnectivityError(error)) {
        generationMongoBackoff.recordFailure(error);
      } else {
        console.error("AI generation startup recovery failed:", error);
      }
    }
  }, 0);
  if (!keepAlive) startupTimer.unref?.();

  console.log(
    `AI generation worker running with content concurrency ${env.aiContentGenerationConcurrency}, video concurrency ${env.aiVideoGenerationConcurrency}, and image concurrency ${env.aiImageGenerationConcurrency}.`,
  );
  return timer;
}

function stopPostGenerationWorker() {
  stopped = true;

  if (timer) {
    clearInterval(timer);
  }

  timer = null;
  if (unsubscribeMongoReady) unsubscribeMongoReady();
  unsubscribeMongoReady = null;
}

module.exports = {
  TASK_TYPE,
  LEGACY_VIDEO_TASK_TYPE,
  buildPostGenerationPlan,
  enqueuePostGeneration,
  recoverCompletedGenerationActions,
  recoverCompletedJobsWithMissingMedia,
  startPostGenerationWorker,
  stopPostGenerationWorker,
  __private: {
    generationMetadata,
    generatedImageTarget,
    processPostGenerationJob,
  },
};
