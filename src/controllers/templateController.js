const Brand = require('../models/Brand');
const Post = require('../models/Post');
const Media = require('../models/Media');
const VideoRender = require('../models/VideoRender');
const VideoTemplate = require('../models/VideoTemplate');
const { buildRenderInput, ensureDefaultTemplates } = require('../services/templateVideoService');
const { spendCredits } = require('../services/creditService');
const { createTemplateVideo } = require('../services/localVideoService');

async function index(req, res, next) {
  try {
    await ensureDefaultTemplates();
    const [brands, templates, renders] = await Promise.all([
      Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 }),
      VideoTemplate.find({ status: 'active' }).sort({ category: 1, name: 1 }),
      VideoRender.find({ createdBy: req.user._id }).populate('brand').populate('template').populate('post').sort({ createdAt: -1 }).limit(30)
    ]);

    res.render('templates/index', { title: 'Templates', layout: 'layouts/dashboard', brands, templates, renders, error: null });
  } catch (error) {
    next(error);
  }
}

async function renderTemplate(req, res, next) {
  try {
    const [brand, template] = await Promise.all([
      Brand.findOne({ _id: req.body.brand, owner: req.user._id }),
      VideoTemplate.findOne({ _id: req.body.template, status: 'active' })
    ]);
    if (!brand || !template) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    const inputData = buildRenderInput({ brand, template, body: req.body });
    const render = await VideoRender.create({
      brand: brand._id,
      template: template._id,
      createdBy: req.user._id,
      inputData,
      status: 'rendering',
      costCredits: 20
    });

    await spendCredits({
      user: req.user,
      amount: 20,
      reason: 'Template video render',
      referenceType: 'VideoRender',
      referenceId: render._id
    });

    try {
      const output = await createTemplateVideo({
        brand,
        inputData,
        userId: req.user._id,
        renderId: render._id,
        durationSeconds: template.durationSeconds || inputData.durationSeconds || 15,
        aspectRatio: inputData.aspectRatio || template.aspectRatio
      });

      await Media.create({
        brand: brand._id,
        uploadedBy: req.user._id,
        fileName: output.fileName,
        fileUrl: output.fileUrl,
        publicId: output.publicId,
        fileType: 'video',
        mimeType: output.mimeType,
        size: output.size,
        folder: output.folder,
        tags: ['template-video', 'local-render', template.category],
        aiPrompt: `${inputData.headline}\n${inputData.offer}\n${inputData.cta}`,
        aiInsights: {
          summary: `Template video rendered from ${template.name} for ${brand.name}.`,
          visualPrompt: inputData.style,
          contentAngles: [inputData.headline, inputData.offer].filter(Boolean),
          recommendedPlatforms: ['instagram', 'facebook', 'tiktok', 'youtube'],
          safetyNotes: ['Review rendered text, offer details, and CTA before publishing.'],
          reuseInstructions: ['Attach this MP4 to video posts or reuse it in campaigns.'],
          generatedFrom: 'local_template_video_renderer',
          generatedAt: new Date()
        }
      });

      render.outputUrl = output.fileUrl;
      render.cloudinaryPublicId = output.publicId;
      render.status = 'ready';
      await render.save();
    } catch (renderError) {
      render.status = 'failed';
      render.errorMessage = renderError.message;
      await render.save();
      throw renderError;
    }

    res.redirect('/dashboard/video-system');
  } catch (error) {
    if (error.status === 402) {
      await ensureDefaultTemplates();
      const [brands, templates, renders] = await Promise.all([
        Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 }),
        VideoTemplate.find({ status: 'active' }).sort({ category: 1, name: 1 }),
        VideoRender.find({ createdBy: req.user._id }).populate('brand').populate('template').populate('post').sort({ createdAt: -1 }).limit(30)
      ]);
      return res.status(402).render('templates/index', { title: 'Templates', layout: 'layouts/dashboard', brands, templates, renders, error: error.message });
    }
    return next(error);
  }
}

async function updateRenderStatus(req, res, next) {
  try {
    const render = await VideoRender.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!render) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    render.status = req.body.status;
    render.outputUrl = req.body.outputUrl || render.outputUrl;
    render.errorMessage = req.body.errorMessage || undefined;
    await render.save();

    res.redirect('/dashboard/video-system');
  } catch (error) {
    next(error);
  }
}

async function createPostFromRender(req, res, next) {
  try {
    const render = await VideoRender.findOne({ _id: req.params.id, createdBy: req.user._id }).populate('brand').populate('template');
    if (!render) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });
    if (!render.outputUrl) {
      return res.status(422).render('templates/index', {
        title: 'Templates',
        layout: 'layouts/dashboard',
        brands: await Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 }),
        templates: await VideoTemplate.find({ status: 'active' }).sort({ category: 1, name: 1 }),
        renders: await VideoRender.find({ createdBy: req.user._id }).populate('brand').populate('template').populate('post').sort({ createdAt: -1 }).limit(30),
        error: 'Render this template to an MP4 before creating a video post.'
      });
    }

    let outputMedia = await Media.findOne({
      brand: render.brand._id,
      uploadedBy: req.user._id,
      fileType: 'video',
      fileUrl: render.outputUrl
    });
    if (!outputMedia) {
      outputMedia = await Media.create({
        brand: render.brand._id,
        uploadedBy: req.user._id,
        fileName: `${render.brand.name} ${render.template?.name || 'template'} video.mp4`,
        fileUrl: render.outputUrl,
        publicId: render.cloudinaryPublicId || render.outputUrl,
        fileType: 'video',
        mimeType: 'video/mp4',
        folder: 'template-video',
        tags: ['template-video', render.template?.category || 'template'],
        aiPrompt: `${render.inputData.headline}\n${render.inputData.offer}\n${render.inputData.cta}`
      });
    }

    const caption = `${render.inputData.headline}\n\n${render.inputData.offer}\n\n${render.inputData.cta}`;
    const post = await Post.create({
      brand: render.brand._id,
      platform: req.body.platform || 'instagram',
      type: 'video',
      title: render.inputData.headline || render.template?.name || 'Template video',
      caption,
      link: render.inputData.website || '',
      media: [outputMedia._id],
      status: 'draft',
      createdBy: req.user._id
    });

    render.post = post._id;
    await render.save();

    res.redirect('/dashboard/content-library');
  } catch (error) {
    next(error);
  }
}

module.exports = { createPostFromRender, index, renderTemplate, updateRenderStatus };
