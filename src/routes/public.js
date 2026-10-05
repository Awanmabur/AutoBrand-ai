const express = require('express');
const publicController = require('../controllers/publicController');
const approvalController = require('../controllers/approvalController');
const { createRateLimiter } = require('../config/rateLimit');

const router = express.Router();
const publicFormLimiter = createRateLimiter({ prefix:'public-form', windowMs:60*60*1000, limit:12, message:{error:'Too many submissions. Try again later.'} });

router.get('/sitemap.xml', publicController.sitemap);
router.get('/', publicController.landing);
router.get('/pricing', publicController.pricing);
router.get('/pricing/:planSlug', publicController.planDetails);
function page(key) { return (req,res,next) => { req.params.pageKey=key; return publicController.staticPage(req,res,next); }; }
router.get('/features', page('features'));
router.get('/integrations', page('integrations'));
router.get('/templates', page('templates'));
router.get('/resources', page('resources'));
router.get('/about', page('about'));
router.get('/help', page('help'));
router.get('/contact', page('contact'));
router.get('/security', page('security'));
router.get('/privacy', page('privacy'));
router.get('/terms', page('terms'));
router.get('/blog', (_req,res)=>res.redirect(301,'/resources'));
router.post('/contact', publicFormLimiter, publicController.contact);
router.get('/start/:planSlug', publicController.startPlan);
router.get('/signup', publicController.signup);
router.get('/review/:token', approvalController.publicReview);
router.post('/review/:token', approvalController.publicDecision);

module.exports = router;
