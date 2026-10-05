const Brand = require('../models/Brand');
const Post = require('../models/Post');
const Campaign = require('../models/Campaign');
const SocialAccount = require('../models/SocialAccount');
const Media = require('../models/Media');
const AiVideoJob = require('../models/AiVideoJob');
const User = require('../models/User');
const PublicInquiry = require('../models/PublicInquiry');
const env = require('../config/env');
const { sendEmail } = require('../services/emailService');
const { getPublicPricingCards } = require('../services/pricing.service');
const { signupNextUrlForPlan } = require('../services/signupPlan.service');
const { PUBLIC_PAGES, absolutePublicUrl, organizationSchema, pageMeta, publicOrigin, scriptJson, softwareSchema, websiteSchema } = require('../services/publicSite.service');

function compactNumber(value) {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}m`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
  return String(number);
}

async function getLandingStats() {
  const [activeBrands,totalPosts,publishedPosts,scheduledPosts,campaigns,connectedAccounts,mediaAssets,videoJobs,users] = await Promise.all([
    Brand.countDocuments({ status: 'active' }), Post.countDocuments({}), Post.countDocuments({ status: 'published' }),
    Post.countDocuments({ status: 'scheduled' }), Campaign.countDocuments({ status: { $ne: 'archived' } }),
    SocialAccount.countDocuments({ status: 'connected' }), Media.countDocuments({}), AiVideoJob.countDocuments({}),
    User.countDocuments({ status: { $ne: 'suspended' } })
  ]);
  const generatedAssets = totalPosts + mediaAssets + videoJobs;
  const approvalRate = totalPosts ? Math.round((publishedPosts / totalPosts) * 100) : null;
  return {
    activeBrands,totalPosts,publishedPosts,scheduledPosts,campaigns,connectedAccounts,mediaAssets,videoJobs,users,generatedAssets,approvalRate,
    platformCount: connectedAccounts, supportedPlatformCount: 9,
    activeBrandsLabel: compactNumber(activeBrands), totalPostsLabel: compactNumber(totalPosts), generatedAssetsLabel: compactNumber(generatedAssets),
    campaignsLabel: compactNumber(campaigns), connectedAccountsLabel: compactNumber(connectedAccounts), usersLabel: compactNumber(users)
  };
}

function planComparisonRows(pricingPlans = []) {
  const limitValue = (plan, key) => { const row = (plan.limitList || []).find((item) => item.key === key); return row?.detail || row?.value || '—'; };
  const rows = [
    ['price','Price',(plan)=>plan.recurringPriceLabel||plan.priceLabel], ['workflow','Workflow',(plan)=>plan.workflowLabel||plan.familyLabel],
    ['aiMode','Generative AI',(plan)=>plan.aiModeLabel], ['aiCredits','AI credits',(plan)=>plan.aiCreditsLabel],
    ['maxBrands','Active brands',(plan)=>limitValue(plan,'maxBrands')], ['maxSocialAccounts','Connected social accounts',(plan)=>limitValue(plan,'maxSocialAccounts')],
    ['maxTeamMembers','Team members',(plan)=>limitValue(plan,'maxTeamMembers')], ['maxManualPosts','Manual/imported posts',(plan)=>limitValue(plan,'maxManualPosts')],
    ['maxScheduledPosts','Scheduled posts',(plan)=>limitValue(plan,'maxScheduledPosts')], ['maxAutoPosts','Auto posts',(plan)=>limitValue(plan,'maxAutoPosts')],
    ['maxHandoffPosts','Handoff posts',(plan)=>limitValue(plan,'maxHandoffPosts')], ['maxAiTextGenerations','AI text generations',(plan)=>limitValue(plan,'maxAiTextGenerations')],
    ['maxAiImageGenerations','AI images',(plan)=>limitValue(plan,'maxAiImageGenerations')], ['maxAiVideoGenerations','AI videos',(plan)=>limitValue(plan,'maxAiVideoGenerations')],
    ['maxAvatarVideos','Avatar videos',(plan)=>limitValue(plan,'maxAvatarVideos')], ['maxClientApprovalLinks','Client approval links',(plan)=>limitValue(plan,'maxClientApprovalLinks')],
    ['maxStorageMb','Media storage',(plan)=>limitValue(plan,'maxStorageMb')], ['usageReset','Usage reset',(plan)=>plan.usageResetLabel]
  ];
  return rows.map(([key,label,getter]) => ({ key,label,values: pricingPlans.map((plan)=>getter(plan)||'—') }));
}

function landingSeo(options = {}, selectedPlan = null) {
  const page = options.initialPublicPage || 'homePage';
  const mappings = {
    homePage: ['AutoBrand AI','Social operating system for Brand Brain, ChatGPT, content creation, approvals, scheduling, publishing and analytics.','/'],
    pricingPage: ['Pricing','Affordable plans for manual publishing, bring-your-own ChatGPT, built-in AutoBrand AI and autonomous Brand Brain workflows.','/pricing'],
    planDetailPage: [selectedPlan?.name || 'Plan details', selectedPlan?.summary || `Review ${selectedPlan?.name || 'AutoBrand'} features, limits and pricing.`, selectedPlan ? `/pricing/${encodeURIComponent(selectedPlan.slug)}` : '/pricing']
  };
  const [title,description,path] = mappings[page] || mappings.homePage;
  return pageMeta({ title,description,path });
}

async function renderLanding(req,res,next,options={}) {
  try {
    const [siteStats,pricingPlans] = await Promise.all([getLandingStats(),getPublicPricingCards()]);
    const selectedPlan = options.selectedPlanSlug ? pricingPlans.find((plan)=>plan.slug===options.selectedPlanSlug)||null : null;
    if (options.selectedPlanSlug && !selectedPlan) { const error = new Error('Plan not found.'); error.status=404; throw error; }
    const seo = landingSeo(options,selectedPlan);
    res.setHeader('Link', '</llms.txt>; rel="describedby"; type="text/markdown"');
    res.render('public/landing', {
      title: options.title || 'AutoBrand AI', layout:false, pricingPlans, selectedPlan,
      planComparisonRows: planComparisonRows(pricingPlans), initialPublicPage: options.initialPublicPage || 'homePage', siteStats, seo,
      structuredData: [scriptJson(organizationSchema()),scriptJson(softwareSchema()),scriptJson(websiteSchema())]
    });
  } catch(error) { next(error); }
}

function landing(req,res,next){ return renderLanding(req,res,next,{initialPublicPage:'homePage',title:'AutoBrand AI'}); }
function pricing(req, res, next) { return renderLanding(req, res, next, { initialPublicPage: 'pricingPage', title: 'Pricing' }); }
function planDetails(req, res, next) { return renderLanding(req, res, next, { initialPublicPage: 'planDetailPage', selectedPlanSlug: req.params.planSlug, title: 'Plan details' }); }

function staticPage(req,res,next){
  try {
    const pageKey = String(req.params.pageKey || req.path.replace(/^\//,'')).trim();
    const page = PUBLIC_PAGES[pageKey];
    if (!page) { const error = new Error('Page not found.'); error.status=404; throw error; }
    const seo = pageMeta({ title: page.title, description: page.description, path: `/${pageKey}` });
    res.setHeader('Link','</llms.txt>; rel="describedby"; type="text/markdown"');
    return res.render('public/seoPage',{ layout:false,page,pageKey,seo,notice:req.query.sent==='1'?'Thanks — your message was received.':(req.query.subscribed==='1'?'You are subscribed to product updates.':''),structuredData:[scriptJson(organizationSchema()),scriptJson(softwareSchema()),scriptJson(websiteSchema())] });
  } catch(error){ return next(error); }
}

function validEmail(value=''){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim()) && String(value).length <= 320; }
function clean(value,max){ return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max); }

async function contact(req,res,next){
  try {
    const name=clean(req.body.name,160), email=clean(req.body.email,320).toLowerCase(), teamType=clean(req.body.teamType,80), message=clean(req.body.message,5000);
    if (!name || !validEmail(email) || message.length < 10) { const error=new Error('Please provide a valid name, email and message.'); error.status=400; error.expose=true; throw error; }
    await PublicInquiry.create({ type:'contact',email,name,teamType,message,status:'new',requestId:req.id,source:'public_contact' });
    if (env.supportEmail) await sendEmail({ to:env.supportEmail,subject:`AutoBrand contact: ${name}`,text:`Name: ${name}\nEmail: ${email}\nTeam: ${teamType || 'Not specified'}\nRequest ID: ${req.id}\n\n${message}` }).catch(()=>{});
    return res.redirect(303,'/contact?sent=1');
  } catch(error){ return next(error); }
}

async function startPlan(req,res,next){
  try { const pricingPlans=await getPublicPricingCards(); const plan=pricingPlans.find((item)=>item.slug===req.params.planSlug); if(!plan){const error=new Error('Plan not found.');error.status=404;throw error;} const checkoutPath=`/dashboard/billing/checkout/${encodeURIComponent(plan.slug)}`; if(req.user)return res.redirect(`${checkoutPath}?onboarding=1`); const nextPath=signupNextUrlForPlan(plan); return res.redirect(`/auth/register?plan=${encodeURIComponent(plan.slug)}&next=${encodeURIComponent(nextPath)}`); } catch(error){next(error);}
}
async function signup(req,res,next){
  try { const planSlug=req.query.plan?String(req.query.plan):'free-trial'; const pricingPlans=await getPublicPricingCards(); const plan=pricingPlans.find((item)=>item.slug===planSlug)||pricingPlans.find((item)=>item.slug==='free-trial'); if(!plan)return res.redirect('/pricing'); const nextPath=signupNextUrlForPlan(plan); return res.redirect(`/auth/register?plan=${encodeURIComponent(plan.slug)}&next=${encodeURIComponent(nextPath)}`); } catch(error){return next(error);}
}

function robots(req,res){
  const origin=publicOrigin();
  const privateRules=['Disallow: /dashboard/','Disallow: /auth/','Disallow: /mcp/','Disallow: /review/','Disallow: /uploads/','Disallow: /health','Disallow: /readyz'];
  const lines=['User-agent: *','Allow: /',...privateRules,'','User-agent: OAI-SearchBot','Allow: /',...privateRules,'','User-agent: OAI-AdsBot','Allow: /',...privateRules,'','User-agent: Claude-SearchBot','Allow: /',...privateRules,'','User-agent: Applebot','Allow: /',...privateRules,''];
  if (!env.allowAiTrainingCrawlers) lines.push('User-agent: GPTBot','Disallow: /','','User-agent: ClaudeBot','Disallow: /','','User-agent: Google-Extended','Disallow: /','','User-agent: Applebot-Extended','Disallow: /','');
  if(origin) lines.push(`Sitemap: ${origin}/sitemap.xml`);
  res.type('text/plain').set('Cache-Control','public, max-age=3600').send(`${lines.join('\n')}\n`);
}

async function sitemap(req,res,next){
  try {
    const plans=await getPublicPricingCards(); const paths=['/','/features','/pricing','/integrations','/templates','/resources','/about','/help','/contact','/security','/privacy','/terms',...plans.map((plan)=>`/pricing/${encodeURIComponent(plan.slug)}`)];
    const escape=(v)=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    const body=paths.map((path)=>`  <url><loc>${escape(absolutePublicUrl(path))}</loc></url>`).join('\n');
    res.type('application/xml').set('Cache-Control','public, max-age=3600').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
  } catch(error){ next(error); }
}

function llms(req,res){
  const origin=publicOrigin();
  res.type('text/markdown; charset=utf-8').set('Cache-Control','public, max-age=3600').send(`# AutoBrand AI\n\n> AutoBrand AI is a social operating system built by Classic Technologies. It combines Brand Brain, manual content workflows, ChatGPT/Codex operation, AutoBrand AI generation, Google Drive assets, social publishing, approvals and analytics.\n\n## Canonical public pages\n- [Home](${origin}/)\n- [Features](${origin}/features)\n- [Pricing](${origin}/pricing)\n- [Integrations](${origin}/integrations)\n- [Resources](${origin}/resources)\n- [Security](${origin}/security)\n- [Privacy](${origin}/privacy)\n- [Terms](${origin}/terms)\n\n## Product facts\n- Every brand can have a Brand Brain. Plan entitlements control automation and built-in AI usage.\n- Users can work manually, connect their own ChatGPT/Codex through AutoBrand MCP, or use AutoBrand AI.\n- Google Drive assets are stored in the connected user's Drive when Drive storage is selected.\n- AutoBrand keeps social provider credentials server-side and does not expose raw provider tokens to ChatGPT.\n- Publishing and analytics capabilities depend on each connected provider's APIs and permissions.\n\n## Private areas\nDo not index or summarize authenticated dashboards, OAuth endpoints, review tokens, media access tokens, payment callbacks, or private workspace data.\n`);
}

function securityText(req,res){
  const lines=[]; if(env.securityContactEmail) lines.push(`Contact: mailto:${env.securityContactEmail}`); else lines.push(`Contact: ${absolutePublicUrl('/contact')}`);
  lines.push(`Expires: ${new Date(Date.now()+365*24*60*60*1000).toISOString()}`,`Canonical: ${absolutePublicUrl('/.well-known/security.txt')}`,`Policy: ${absolutePublicUrl('/security')}`,'Preferred-Languages: en');
  res.type('text/plain').set('Cache-Control','public, max-age=86400').send(`${lines.join('\n')}\n`);
}

module.exports={landing,pricing,planDetails,signup,startPlan,staticPage,contact,robots,sitemap,llms,securityText,getLandingStats};
