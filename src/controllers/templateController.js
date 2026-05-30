const Brand = require('../models/Brand');
const Post = require('../models/Post');
const VideoRender = require('../models/VideoRender');
const VideoTemplate = require('../models/VideoTemplate');
const { buildRenderInput, ensureDefaultTemplates } = require('../services/templateVideoService');
const { spendCredits } = require('../services/creditService');

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
      status: 'queued',
      costCredits: 20
    });

    await spendCredits({
      user: req.user,
      amount: 20,
      reason: 'Template video render',
      referenceType: 'VideoRender',
      referenceId: render._id
    });

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

    const caption = `${render.inputData.headline}\n\n${render.inputData.offer}\n\n${render.inputData.cta}`;
    const post = await Post.create({
      brand: render.brand._id,
      platform: req.body.platform || 'instagram',
      type: 'video',
      title: render.inputData.headline || render.template?.name || 'Template video',
      caption,
      link: render.inputData.website || '',
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
