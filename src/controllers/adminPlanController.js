const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const AuditLog = require('../models/AuditLog');
const { DEFAULT_PLAN_MATRIX, seedDefaultPlans } = require('../services/subscription.service');
const {
  buildPlanPayload,
  parseJson
} = require('../services/admin/planForm.service');

function planBasePathFor() {
  return '/dashboard/plans';
}

function redirectToPlans(req, res, suffix = '') {
  const cleanSuffix = String(suffix || '').replace(/^\/+/, '');
  if (!cleanSuffix) return res.redirect(planBasePathFor(req));
  if (cleanSuffix.endsWith('/edit')) {
    const id = cleanSuffix.replace(/\/edit$/, '');
    return res.redirect(`${planBasePathFor(req)}?mode=edit&id=${encodeURIComponent(id)}`);
  }
  return res.redirect(`${planBasePathFor(req)}?view=${encodeURIComponent(cleanSuffix)}`);
}


async function audit(req, action, plan, metadata = {}) {
  if (!req.user) return;
  await AuditLog.create({
    user: req.user._id,
    action,
    entityType: 'SubscriptionPlan',
    entityId: plan?._id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata
  });
}

async function index(req, res, next) {
  try {
    return res.redirect(303, planBasePathFor(req));
  } catch (error) {
    next(error);
  }
}

function newPlan(req, res) {
  return res.redirect(303, `${planBasePathFor(req)}?mode=create`);
}

async function create(req, res, next) {
  try {
    const plan = await SubscriptionPlan.create(buildPlanPayload(req.body));
    await audit(req, 'plan_create', plan);
    redirectToPlans(req, res, plan._id);
  } catch (error) {
    next(error);
  }
}

async function show(req, res, next) {
  try {
    return res.redirect(303, `${planBasePathFor(req)}?view=${encodeURIComponent(req.params.id)}`);
  } catch (error) {
    next(error);
  }
}

async function edit(req, res, next) {
  try {
    return res.redirect(303, `${planBasePathFor(req)}?mode=edit&id=${encodeURIComponent(req.params.id)}`);
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, buildPlanPayload(req.body), { new: true, runValidators: true });
    if (!plan) {
      const error = new Error('Plan not found.');
      error.status = 404;
      throw error;
    }
    await audit(req, 'plan_update', plan);
    redirectToPlans(req, res, plan._id);
  } catch (error) {
    next(error);
  }
}

async function duplicate(req, res, next) {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id).lean();
    if (!plan) {
      const error = new Error('Plan not found.');
      error.status = 404;
      throw error;
    }
    delete plan._id;
    delete plan.createdAt;
    delete plan.updatedAt;
    plan.name = `${plan.name} Copy`;
    plan.slug = `${plan.slug}-copy-${Date.now().toString(36)}`;
    plan.isActive = false;
    plan.isPublic = false;
    const copy = await SubscriptionPlan.create(plan);
    await audit(req, 'plan_duplicate', copy, { source: req.params.id });
    redirectToPlans(req, res, `${copy._id}/edit`);
  } catch (error) {
    next(error);
  }
}

async function setActive(req, res, next) {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, { isActive: req.path.endsWith('/activate') }, { new: true });
    if (!plan) {
      const error = new Error('Plan not found.');
      error.status = 404;
      throw error;
    }
    await audit(req, plan.isActive ? 'plan_activate' : 'plan_deactivate', plan);
    redirectToPlans(req, res);
  } catch (error) {
    next(error);
  }
}

async function restore(req, res, next) {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, { deletedAt: undefined, isActive: true }, { new: true });
    if (!plan) {
      const error = new Error('Plan not found.');
      error.status = 404;
      throw error;
    }
    await audit(req, 'plan_restore', plan);
    redirectToPlans(req, res);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) {
      const error = new Error('Plan not found.');
      error.status = 404;
      throw error;
    }
    const subscriptions = await Subscription.countDocuments({ planRef: plan._id });
    if (subscriptions > 0) {
      plan.deletedAt = new Date();
      plan.isActive = false;
      plan.isPublic = false;
      await plan.save();
      await audit(req, 'plan_soft_delete', plan, { subscriptions });
    } else {
      await plan.deleteOne();
      await audit(req, 'plan_delete', plan);
    }
    redirectToPlans(req, res);
  } catch (error) {
    next(error);
  }
}

async function reorder(req, res, next) {
  try {
    const order = parseJson(req.body.orderJson, []);
    if (Array.isArray(order)) {
      await Promise.all(order.map((item, index) => SubscriptionPlan.updateOne(
        { _id: item.id || item },
        { sortOrder: item.sortOrder ?? index + 1 }
      )));
    }
    redirectToPlans(req, res);
  } catch (error) {
    next(error);
  }
}

async function seed(req, res, next) {
  try {
    await seedDefaultPlans({ overwrite: req.body.overwrite === 'on' });
    redirectToPlans(req, res);
  } catch (error) {
    next(error);
  }
}

module.exports = { create, duplicate, edit, index, newPlan, remove, reorder, restore, seed, setActive, show, update };
