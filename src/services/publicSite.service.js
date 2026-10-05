const env = require('../config/env');

const PUBLIC_PAGES = {
  contact: {
    title: 'Contact',
    description: 'Contact AutoBrand AI for product, onboarding, agency, billing, security or partnership questions.',
    eyebrow: 'Contact',
    heading: 'Tell us what you want AutoBrand to help you operate.',
    intro: 'Use this form for product questions, onboarding, agency setup, billing help, partnerships or support. Do not send passwords, API keys or social-provider access tokens.',
    sections: [
      ['Product and onboarding', 'Get help choosing an operating mode, connecting channels, configuring Brand Brain, Google Drive or ChatGPT, and preparing your first publishing workflow.'],
      ['Support and security', 'Describe the problem without including secrets. Security-sensitive reports should use the security contact listed on the Security page when configured.']
    ]
  },
  features: {
    title: 'Features',
    description: 'Create, store, approve, schedule, publish and improve social content with Brand Brain, ChatGPT, AutoBrand AI, Google Drive and multi-channel analytics.',
    eyebrow: 'Product',
    heading: 'One social operating system from idea to performance.',
    intro: 'AutoBrand AI combines brand intelligence, content workflows, publishing infrastructure and analytics so teams can work manually, with their own ChatGPT, or with AutoBrand AI automation.',
    sections: [
      ['Brand Brain for every brand', 'Save voice, audience, products, offers, goals, content pillars, approval rules and performance context once. Manual workflows, ChatGPT and AutoBrand AI can all use the same brand memory.'],
      ['Three ways to work', 'Upload your own content, connect ChatGPT as an operator, or use AutoBrand AI Brain on eligible plans. The platform remains the secure execution layer for storage, scheduling, publishing and analytics.'],
      ['Content operations', 'Create drafts, organize media, validate platform requirements, request approvals, schedule across channels, recover failed posts and track publishing status from one workflow.'],
      ['Channel workspaces', 'Facebook, Instagram, LinkedIn, TikTok, YouTube, X, Threads, Pinterest and Google Business Profile each get focused account health, content and performance views.'],
      ['Storage choice', 'Keep media in AutoBrand, your own connected Google Drive, or both. Drive files remain owned by the connected Google account.'],
      ['Teams and agencies', 'Use roles, workspace permissions, approvals and client-ready workflows while billing and usage stay attached to the correct brand owner.']
    ]
  },
  integrations: {
    title: 'Integrations',
    description: 'Connect social channels, ChatGPT/Codex, Google Drive, AI providers and publishing services to AutoBrand AI.',
    eyebrow: 'Integrations',
    heading: 'Connect the tools that already run your brand.',
    intro: 'AutoBrand keeps provider credentials protected while giving your team one place to operate connected social, storage and AI workflows.',
    sections: [
      ['Social publishing', 'Connect Facebook, Instagram, LinkedIn, TikTok, YouTube, X, Threads, Pinterest and Google Business Profile. Capabilities depend on each provider account and permissions.'],
      ['ChatGPT and Codex', 'Connect through AutoBrand’s MCP endpoint so your own ChatGPT can discover brands, upload media, manage drafts, schedule or publish allowed content and read analytics.'],
      ['Google Drive', 'Store assets in your own Drive through the drive.file permission model. AutoBrand manages files created or explicitly used through the integration without taking ownership of your Drive.'],
      ['AI providers', 'Route eligible AutoBrand AI generation through configured providers while credits, per-plan quotas and monthly token budgets protect account usage and platform cost.'],
      ['Media storage', 'Use durable AutoBrand storage, Google Drive, or both. Media proxies and provider publishing workers handle delivery without exposing private provider tokens.']
    ]
  },
  templates: {
    title: 'Templates',
    description: 'Reusable brand, campaign and social publishing templates for faster content operations in AutoBrand AI.',
    eyebrow: 'Templates',
    heading: 'Start from a repeatable workflow, not an empty box.',
    intro: 'Templates help teams preserve useful structures while Brand Brain supplies the context that makes each output specific to the business.',
    sections: [
      ['Campaign structures', 'Launches, promotions, educational series, evergreen content and client campaigns can begin from reusable goals, pillars, formats and CTA patterns.'],
      ['Platform-ready variations', 'Use a common source idea while adapting captions, media intent and publishing requirements for each connected network.'],
      ['Team consistency', 'Keep repeatable briefs, approval expectations and delivery formats available across collaborators without forcing every user to recreate the process.']
    ]
  },
  resources: {
    title: 'Resources',
    description: 'Practical guidance for Brand Brain, social publishing, ChatGPT workflows, Google Drive assets, analytics and AutoBrand AI automation.',
    eyebrow: 'Resources',
    heading: 'Build a reliable content operation, not just more posts.',
    intro: 'Use these product principles to set up a brand that can be operated manually, through ChatGPT, or through AutoBrand AI without losing control of permissions, storage or approvals.',
    sections: [
      ['Set up Brand Brain first', 'Document voice, audience, offers, products, goals, blocked language, CTA preferences and approval rules before automating content.'],
      ['Choose your operating mode', 'Manual is best when you already create assets. ChatGPT Operator is useful when you want your own AI to work through AutoBrand. AutoBrand Brain adds built-in generation and Growth+ background automation.'],
      ['Keep ownership clear', 'Select AutoBrand storage, your Google Drive, or both. Social provider credentials remain encrypted inside AutoBrand and are never handed to connected ChatGPT clients.'],
      ['Measure outcomes', 'Use per-channel workspaces and cross-channel analytics to compare publishing reliability, reach, engagement and content patterns over time.']
    ]
  },
  about: {
    title: 'About AutoBrand AI',
    description: 'AutoBrand AI is a social operating system built by Classic Technologies for brands, creators, teams and agencies.',
    eyebrow: 'Company',
    heading: 'Technology built around the real work of running a brand.',
    intro: 'AutoBrand AI is developed by Classic Technologies as a practical system for organizing brand context, content creation, social publishing, collaboration, storage and performance learning.',
    sections: [
      ['Our product principle', 'Automation should reduce repetitive work without removing ownership, permissions, approvals or visibility. Users can stay manual, bring their own ChatGPT, or use AutoBrand AI according to their plan.'],
      ['Global by design', 'The product is designed for creators, businesses, institutions, teams and agencies regardless of geography. Provider availability and billing methods can differ by market.'],
      ['Built for real operations', 'The same platform handles brand memory, media, scheduling, provider delivery, analytics, team permissions and billing rather than treating them as unrelated tools.']
    ]
  },
  help: {
    title: 'Help Center',
    description: 'Help for connecting social accounts, Brand Brain, ChatGPT, Google Drive, scheduling, publishing, billing and AutoBrand AI.',
    eyebrow: 'Support',
    heading: 'Find the right place to solve a workflow problem.',
    intro: 'Most operational issues fall into account access, social permissions, media/storage, publishing, AI usage or billing. AutoBrand keeps these states visible so problems can be diagnosed instead of hidden.',
    sections: [
      ['Connection health', 'Open the relevant channel workspace to check whether an account is connected, needs reauthorization or is missing provider permissions.'],
      ['Publishing problems', 'Failed deliveries keep provider error context and can be retried through the platform after the underlying account, media or permission issue is corrected.'],
      ['AI and plan limits', 'AutoBrand checks plan features, generation quotas, AI credits and token budgets before built-in AI runs. Your own ChatGPT cannot bypass those entitlements.'],
      ['Billing', 'AutoBrand verifies Pesapal payments server-to-server. Upgrades can use unused-period credit; downgrades and equal-price branch switches take effect at the end of the current paid period.']
    ]
  },
  security: {
    title: 'Security',
    description: 'How AutoBrand AI protects accounts, provider credentials, payments, connected storage and publishing operations.',
    eyebrow: 'Trust',
    heading: 'Security is part of the publishing architecture.',
    intro: 'AutoBrand separates user authentication, provider credentials, workspace permissions and external write actions so connected tools do not become master keys to customer accounts.',
    sections: [
      ['Account and session security', 'Short-lived access tokens, rotating refresh tokens, session revocation, CSRF protections, production host validation and hardened cookies protect browser sessions.'],
      ['Provider credentials', 'Social and storage provider tokens are encrypted at rest and used by AutoBrand’s server-side integrations. ChatGPT receives AutoBrand tools, not raw Facebook, Google or other provider tokens.'],
      ['Publishing controls', 'Brand membership, role permissions, plan entitlements, account readiness, approval rules and idempotency checks are applied before external publishing actions.'],
      ['Network and media protections', 'Remote media fetching blocks private networks, unsafe URL ports, dangerous content types and mismatched common media signatures.'],
      ['Payments and usage', 'Paid access activates after provider verification. Active subscriptions carry frozen commercial snapshots, while AI credits, quotas and token budgets are enforced server-side.'],
      ['Report a security issue', env.securityContactEmail ? `Send responsible security reports to ${env.securityContactEmail}. Please avoid sending secrets or customer data in the initial report.` : 'Use the Contact page to request the current responsible disclosure address before sharing sensitive details.']
    ]
  },
  privacy: {
    title: 'Privacy Policy',
    description: 'AutoBrand AI privacy policy for accounts, Brand Brain, connected social accounts, Google Drive, ChatGPT/MCP, AI providers, billing and analytics.',
    eyebrow: 'Legal',
    heading: 'Privacy policy.',
    intro: 'This policy explains the main categories of information AutoBrand processes to provide brand, publishing, storage, AI, collaboration and billing workflows.',
    updated: 'October 4, 2026',
    sections: [
      ['Information you provide', 'Account details, Brand Brain context, products and offers, audience notes, content, media, campaign instructions, approval settings, support messages and team/workspace information.'],
      ['Connected social accounts', 'When you connect a provider, AutoBrand stores the identifiers and encrypted credentials needed to perform the actions you authorize. Provider permissions and retention also remain subject to that provider’s terms.'],
      ['Google Drive', 'If you connect Google Drive, AutoBrand uses the authorized Google account. Drive-only files remain in that user’s Drive; disconnecting AutoBrand does not delete the user’s Drive files. AutoBrand may retain asset metadata required for platform history and publishing records.'],
      ['ChatGPT / MCP', 'A connected ChatGPT or Codex client receives AutoBrand tools scoped to the authenticated AutoBrand account and OAuth permissions. AutoBrand does not give that client raw social-provider access tokens. Tool actions and resulting platform changes may be logged for security and audit purposes.'],
      ['AI providers', 'When built-in AI is used, relevant prompts or media may be sent to the configured AI provider to perform the requested generation. AutoBrand records usage needed for quotas, cost controls and reliability.'],
      ['Payments', 'AutoBrand stores payment references, status, commercial plan snapshots and reconciliation information required to manage paid access. Sensitive payment credentials are handled by the payment provider rather than stored as card data by AutoBrand.'],
      ['Security and retention', 'AutoBrand uses access controls, encrypted credentials, audit records and lifecycle processes to protect the service. Some records may be retained for security, fraud prevention, accounting, dispute handling or legal obligations after workspace content is removed.'],
      ['Your choices', 'You can disconnect providers, change storage preferences, revoke connected ChatGPT clients and request account deletion through supported account controls. Provider-side copies and user-owned Drive files remain governed by the respective provider/account owner.']
    ]
  },
  terms: {
    title: 'Terms of Service',
    description: 'Terms for AutoBrand AI accounts, subscriptions, AI features, connected services, publishing and user responsibility.',
    eyebrow: 'Legal',
    heading: 'Terms of service.',
    intro: 'These terms describe the operational rules for using AutoBrand AI. They are a product-level summary and should be reviewed by qualified counsel for the jurisdictions where you launch.',
    updated: 'October 4, 2026',
    sections: [
      ['Accounts and authorization', 'You are responsible for account security and for connecting only social, storage and other external accounts that you are authorized to manage.'],
      ['Content and AI output', 'You remain responsible for reviewing claims, rights, offers, pricing, facts and platform-policy compliance before publishing. AI output can be incomplete or incorrect and should not be treated as professional legal, medical or financial advice.'],
      ['External services', 'Publishing, analytics, storage, AI and payment functions can depend on third-party APIs. Provider outages, account restrictions, permission changes or policy changes can affect availability.'],
      ['Subscriptions', 'Paid access is based on the price, currency, limits and features captured for the applicable paid period. Verified upgrades can apply unused-period credit. Downgrades and equal-price branch changes are scheduled for period end under the current manual-renewal billing model.'],
      ['Acceptable use', 'Do not use the service for unlawful, infringing, deceptive, abusive or unauthorized activity, credential theft, platform manipulation or attempts to bypass plan/security controls.'],
      ['Service changes', 'Features and provider integrations may change as external APIs, security requirements and product capabilities evolve. Material commercial changes should apply according to the active subscription contract and published policies.']
    ]
  }
};

function publicOrigin() {
  const value = env.publicAppUrl || env.appUrl;
  try { return new URL(value).origin; } catch (_error) { return ''; }
}

function absolutePublicUrl(pathname = '/') {
  try { return new URL(pathname, `${publicOrigin() || env.appUrl}/`).toString(); } catch (_error) { return pathname; }
}

function pageMeta({ title = 'AutoBrand AI', description = '', path = '/', imagePath = '/assets/autobrand-og.png', robots = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' } = {}) {
  const fullTitle = title === 'AutoBrand AI' ? 'AutoBrand AI | Social Operating System' : `${title} | AutoBrand AI`;
  return {
    title: fullTitle,
    description: description || 'Plan, create, store, approve, schedule, publish and improve social content with Brand Brain, ChatGPT and AutoBrand AI.',
    canonical: absolutePublicUrl(path),
    image: absolutePublicUrl(imagePath),
    robots
  };
}

function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'AutoBrand AI',
    url: absolutePublicUrl('/'),
    logo: absolutePublicUrl('/assets/autobrand-icon-512.png'),
    parentOrganization: { '@type': 'Organization', name: 'Classic Technologies' }
  };
}

function softwareSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AutoBrand AI',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: absolutePublicUrl('/'),
    description: 'Social operating system for Brand Brain, content operations, ChatGPT workflows, scheduling, publishing and analytics.',
    creator: { '@type': 'Organization', name: 'Classic Technologies' }
  };
}


function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AutoBrand AI',
    url: absolutePublicUrl('/'),
    description: 'AutoBrand AI is a social operating system for Brand Brain, content operations, publishing, collaboration and analytics.',
    publisher: { '@type': 'Organization', name: 'Classic Technologies' }
  };
}

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

module.exports = { PUBLIC_PAGES, absolutePublicUrl, organizationSchema, pageMeta, publicOrigin, scriptJson, softwareSchema, websiteSchema };
