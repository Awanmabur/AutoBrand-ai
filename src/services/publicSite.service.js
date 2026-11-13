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


/* Product-led content for the shared marketing pages. Claims are intentionally
   limited to implemented workflows and conditional provider/plan availability. */
const PUBLIC_PAGE_GUIDES = {
  features: {
    title: 'AI Social Media Management & Publishing',
    description: 'Plan on-brand social content with Brand Brain, create with ChatGPT or AutoBrand AI, review drafts, schedule publishing, manage media and analyse connected channels.',
    steps: [
      ['Build your Brand Brain', 'Define brand voice, target audience, products, content pillars, tone and approval rules before producing social posts.'],
      ['Create and organize content', 'Draft manually, work with your connected ChatGPT, or use available AutoBrand AI generation. Keep captions, visual assets and campaign context together.'],
      ['Review, schedule and publish', 'Apply the brand’s approval and permission rules, check media requirements and schedule supported social channels. Publishing depends on provider permissions.'],
      ['Measure and improve', 'Review connected-account performance and use the findings to refine future creative briefs, topics and posting schedules.']
    ],
    more: [
      ['Social media content approval workflow', 'Teams and agencies can separate drafting from approval and publishing. Roles, plan features and provider readiness determine who can act; a connected AI operator cannot bypass those controls.'],
      ['Content calendar and media management', 'Organize reusable media, planned posts and campaigns across brands. Select AutoBrand storage, your Google Drive, or both where connected and enabled.'],
      ['Publishing recovery and performance', 'Keep a visible record of publishing states and provider errors. Resolve expired permissions, rejected media or channel limitations before retrying failed publishing actions.']
    ],
    faqs: [
      ['Can I use AutoBrand AI without AI-generated content?', 'Yes. The manual publishing path supports user-provided content and media; available workflows depend on the selected plan.'],
      ['Does AutoBrand AI publish everywhere automatically?', 'No. Supported publishing actions depend on the connected provider, authorized permissions, media requirements and the selected plan.'],
      ['Can different people draft and approve posts?', 'Team roles and approval workflows support controlled collaboration where included in the account’s plan.']
    ]
  },
  integrations: {
    title: 'Social Integrations, ChatGPT & Google Drive',
    description: 'Explore AutoBrand AI social media publishing integrations, Google Drive asset storage, Brand Brain workflows and secure ChatGPT/Codex connectivity.',
    steps: [
      ['Connect an authorized account', 'Sign in to the social provider using an account you have permission to manage. AutoBrand requests the available scopes required for its supported workflows.'],
      ['Check provider readiness', 'Review connection health and missing permissions before scheduling or publishing. Some social networks require specific account types, media sizes or approval flows.'],
      ['Choose how content is created', 'Use your own content, a connected ChatGPT through the AutoBrand MCP connector, or built-in AutoBrand AI on eligible plans.'],
      ['Choose asset storage', 'Use AutoBrand media storage, your connected Google Drive, or a combination supported by your current configuration.']
    ],
    more: [
      ['Facebook, Instagram and LinkedIn content operations', 'Coordinate posts and analytics for connected accounts where platform scopes and account eligibility permit. Not every network exposes identical features through its API.'],
      ['TikTok, YouTube, X, Threads, Pinterest and Google Business Profile', 'Available publishing, media and analytics operations differ by provider, authorization and application approval status. AutoBrand checks readiness before supported actions.'],
      ['ChatGPT / Codex MCP connector', 'ChatGPT can request allowed actions through AutoBrand’s authenticated tools; provider access tokens stay on the AutoBrand server and brand permissions remain enforced.'],
      ['Google Drive integration', 'Store and manage selected content assets in a connected user-owned Google Drive without treating that Drive as an unrestricted workspace.']
    ],
    faqs: [
      ['Do I need to give ChatGPT my social media password?', 'No. Authorized tool calls go through AutoBrand; social provider credentials are not passed to ChatGPT.'],
      ['Why does an integration show limited publishing features?', 'Provider APIs, account types, approved scopes and plan limits differ. Check the channel’s connection status and current provider requirements.'],
      ['Can I disconnect a social account or storage integration?', 'Connected services can be managed from their supported account/workspace controls, subject to your permissions.']
    ]
  },
  templates: {
    title: 'Social Media Campaign & Content Templates',
    description: 'Organize social media campaign briefs, content pillars, channel-specific post variations, approval checklists and brand voice in AutoBrand AI.',
    steps: [
      ['Choose a campaign goal', 'Start with an announcement, launch, educational series, offer or evergreen campaign. Define the audience and the desired action.'],
      ['Apply Brand Brain', 'Use the brand’s voice, product facts and approval rules so a reusable template does not become generic or inaccurate.'],
      ['Adapt to each social network', 'Review caption length, creative format, calls to action and media requirements before scheduling supported channels.'],
      ['Review and learn', 'Route drafts for approval when required, then compare performance to make the next campaign brief more useful.']
    ],
    more: [
      ['Campaign briefing templates', 'Document goals, target audience, products, campaign dates, channel mix and success measures before creating posts.'],
      ['Reusable content pillars', 'Keep education, product value, customer questions, announcements and community topics consistent across a publishing calendar.'],
      ['Agency review checklists', 'Make client approval requirements and publishing ownership explicit rather than letting a generated caption publish without oversight.']
    ],
    faqs: [
      ['Do templates replace a brand strategy?', 'No. Templates provide repeatable structure; Brand Brain supplies the brand-specific voice, audience, goals and constraints.'],
      ['Can one brief be used across multiple channels?', 'Yes, as a starting point. Each final post should be adapted to the channel’s requirements and permissions.']
    ]
  },
  resources: {
    title: 'Social Media Automation Guides & Resources',
    description: 'Learn how to set up Brand Brain, connect social accounts, prepare a content calendar, use ChatGPT with AutoBrand AI and review analytics responsibly.',
    steps: [
      ['1. Prepare your brand profile', 'Write down your audience, products, tone, promises, restricted claims, campaign goals and approval responsibilities. Enter that context in Brand Brain.'],
      ['2. Connect and verify social channels', 'Connect accounts you are authorized to use and inspect which publishing and analytics actions the providers permit. Resolve permissions before planning automation.'],
      ['3. Build a weekly content workflow', 'Plan relevant topics, assets, post formats, reviewers and publication times. Use manual drafting, ChatGPT or the built-in AI path available on your plan.'],
      ['4. Review every publishing handoff', 'Check facts, links, product offers, consent and media rights. Assign approvals where needed before scheduling or publishing.'],
      ['5. Read performance and refine', 'Review available metrics, publishing failures and the response to each content pillar. Improve the next brief using evidence, not fabricated engagement claims.']
    ],
    more: [
      ['Guide: Set up a Brand Brain', 'Capture brand identity, the ideal customer, product differentiators, words to avoid, content pillars, offers and calls to action. This makes AI-assisted writing more consistent.'],
      ['Guide: ChatGPT-powered social media workflow', 'Use AutoBrand’s connected tools for permitted brand operations; AutoBrand checks OAuth scopes, roles and plan entitlements before executing actions.'],
      ['Guide: Social media content calendar', 'Create a balanced schedule of helpful tips, product education, customer questions and campaign announcements. Adjust each post for the intended network.'],
      ['Guide: Google Drive media organization', 'Keep assets named, reviewed and associated with the correct brand. Select Drive storage only when the owner has connected and authorized their Google account.'],
      ['Guide: Social media analytics', 'Compare post reach, engagement and publishing reliability where provider data is available. Distinguish observable outcomes from estimated revenue or attribution.']
    ],
    faqs: [
      ['What should I configure before using AI social media automation?', 'First configure Brand Brain, authorized channels, permissions, content rules, review requirements and a plan that enables the intended workflow.'],
      ['Can I bring my own ChatGPT instead of paying for built-in generation?', 'A bring-your-own-AI/manual workflow is available on supported plans. Compare current plan entitlements on the Pricing page.'],
      ['Does AutoBrand AI guarantee more followers or sales?', 'No. It helps organize and execute social publishing workflows; campaign results depend on content, audience, distribution and the connected platforms.']
    ]
  },
  about: {
    title: 'About Our Social Media Platform',
    description: 'Learn why Classic Technologies built AutoBrand AI for creators, businesses, institutions and agencies managing brand voice, publishing, AI and analytics.',
    more: [
      ['One platform, three operating approaches', 'AutoBrand AI supports manual social publishing, workflows assisted by a user’s own connected ChatGPT, and eligible built-in AutoBrand AI automation. Users can choose based on the work they need and the plan they use.'],
      ['Built around responsible control', 'Brand Brain, membership permissions, content approvals, integration readiness and usage limits are part of the product workflow. Faster content creation should not mean giving up oversight.'],
      ['Made for growing brands and agencies', 'Keep brand identities, connected channels, media and performance context in a structured workspace as content operations become more complex.']
    ],
    faqs: [
      ['Who builds AutoBrand AI?', 'AutoBrand AI is developed by Classic Technologies.'],
      ['Is AutoBrand AI only for agencies?', 'No. It is designed for creators, businesses, marketing teams, institutions and agencies, with features governed by plan eligibility.']
    ]
  },
  help: {
    title: 'Help with Social Publishing, AI & Billing',
    description: 'Troubleshoot social media account connections, ChatGPT and Brand Brain access, Google Drive media, failed publishing, AI quotas and subscription payments.',
    steps: [
      ['Check the right workspace', 'Open the brand and social channel involved. Confirm that your user role gives you access to the action you are trying to perform.'],
      ['Read the current status', 'Inspect connection permissions, publishing state, approval status, media validation or account plan limits before repeating an action.'],
      ['Correct the underlying issue', 'Reconnect expired provider authorization, use supported media, obtain approval or select a plan with the required entitlement.'],
      ['Request support with context', 'Include the affected feature, channel, approximate time and the visible error. Do not include passwords, tokens or private customer records.']
    ],
    more: [
      ['Social publishing troubleshooting', 'A failed post can be caused by provider permissions, expired connections, missing approval, rejected media or external service limits. Do not retry blindly without checking the failure reason.'],
      ['ChatGPT and AI access', 'Built-in AI credits, generation quotas and token budgets are checked by the server. A connected ChatGPT client cannot override brand access controls or usage limits.'],
      ['Payment and subscription help', 'Paid access follows verified Pesapal payment status. Review the displayed billing period and payment verification before retrying a transaction.']
    ],
    faqs: [
      ['Why can I not schedule or publish a post?', 'Check the selected brand, your role, the connected account, provider permissions, plan limits and any approval or media requirements.'],
      ['What happens after a failed payment?', 'AutoBrand verifies payment provider results server-to-server. Do not assume a pending callback means the subscription has activated.'],
      ['Where do I report a problem?', 'Use the Contact page and provide safe diagnostic details without credentials or private records.']
    ]
  },
  contact: {
    title: 'Contact Sales, Onboarding & Support',
    description: 'Contact AutoBrand AI about social media management, Brand Brain setup, team onboarding, integrations, agency workflows, security and subscription support.',
    more: [
      ['Product questions and onboarding', 'Tell the team whether you manage your own brand, work with a marketing team or operate multiple clients. Explain the channels and workflow you want to support.'],
      ['Agency and business enquiries', 'Describe how many brands, reviewers and social accounts are involved, and whether you need manual publishing, ChatGPT integration or built-in AI workflows.'],
      ['Help with existing accounts', 'Include the feature name, channel and a safe description of the error. Never send account passwords, payment credentials, API keys or social provider tokens through the form.']
    ],
    faqs: [
      ['What should I include in my message?', 'Share your goal, the relevant feature or social network, and what you already tried. Do not include credentials or sensitive customer information.'],
      ['Can I ask about available plans before registering?', 'Yes. Use the contact form for product and plan questions; live prices and feature entitlements are shown on the Pricing page.']
    ]
  },
  security: {
    title: 'Social Publishing Security & Privacy',
    description: 'Review AutoBrand AI security controls for social account credentials, workspace access, ChatGPT MCP permissions, publishing approvals, billing and media.',
    more: [
      ['Control who can publish', 'Brand membership, roles, approval rules and subscription permissions are verified by the backend before protected actions. A public interface alone does not authorize publishing.'],
      ['Protect social and storage tokens', 'Connected platform credentials remain protected on AutoBrand servers. Do not include access tokens in public forms, content prompts, shareable links or support messages.'],
      ['Safer media and external requests', 'The platform validates remote media input and uses protected media delivery paths to reduce unsafe fetching and unauthorized access.'],
      ['Financial and operational reliability', 'Payment activation relies on verified provider results, while background publishing should preserve traceable states and safe retry behavior.']
    ],
    faqs: [
      ['Can a connected AI assistant access everything in my social accounts?', 'No. AutoBrand mediates allowed tools using authenticated scopes, brand roles and plan entitlements; it does not send raw provider tokens to the assistant.'],
      ['Should I send tokens or passwords with a support request?', 'No. Never send credentials through the public contact form. Use the published security reporting channel for sensitive disclosures.']
    ]
  },
  privacy: {
    title: 'Privacy Policy & Connected Account Data',
    description: 'Understand how AutoBrand AI handles brand information, social account tokens, Google Drive assets, ChatGPT integrations, analytics and billing data.',
    more: [
      ['Understanding connected-service data', 'Authorizing a social network or Google Drive connection gives AutoBrand access to the permissions granted through that provider. Provider-side copies and account retention remain subject to that provider’s policies.'],
      ['AI prompts and brand context', 'Brand Brain and content prompts may be processed through a configured AI provider when the user selects supported AI operations. Avoid adding unnecessary sensitive information to prompts.'],
      ['Account and data controls', 'Use supported account controls to disconnect services, manage content and request deletion. Some audit, payment or security records may need to be retained under applicable requirements.']
    ],
    faqs: [
      ['Does connecting Google Drive transfer ownership of my Drive?', 'No. Files kept only in a connected user-owned Drive remain in that user’s account, subject to provider and product behavior.'],
      ['Does ChatGPT receive my social network access tokens?', 'No. AutoBrand keeps provider credentials server-side; the connected client uses scoped AutoBrand tools.']
    ]
  },
  terms: {
    title: 'Terms of Service & Subscription Rules',
    description: 'Read AutoBrand AI terms for authorized social media connections, content rights, AI outputs, subscriptions, publishing integrations and acceptable use.',
    more: [
      ['Use only accounts you are authorized to manage', 'Do not connect social channels, client assets, ad accounts or storage owned by others without appropriate permission. Provider terms continue to apply to connected accounts.'],
      ['Review generated content before publishing', 'Users remain responsible for accuracy, intellectual property rights, product and pricing claims, required disclosures and compliance with provider rules.'],
      ['Understand plan and provider limitations', 'Available capabilities depend on the current plan, authorized scopes, provider availability and account status. Review the current commercial terms before making a payment.']
    ],
    faqs: [
      ['Is generated content guaranteed to be accurate or compliant?', 'No. AI-generated text and media must be reviewed by the responsible user before publishing.'],
      ['Do external social platforms have their own rules?', 'Yes. Connecting AutoBrand does not replace the policies or account requirements of a social media or storage provider.']
    ]
  }
};
for (const [key, guide] of Object.entries(PUBLIC_PAGE_GUIDES)) {
  const page = PUBLIC_PAGES[key];
  if (!page) throw new Error('Missing public page for marketing guide: ' + key);
  const { title, description, steps, more, faqs } = guide;
  if (title) page.title = title;
  if (description) page.description = description;
  if (steps) page.steps = steps;
  if (faqs) page.faqs = faqs;
  if (more) page.sections = [...page.sections, ...more];
}



const PUBLIC_PAGE_HEADINGS = {
  features: 'AI social media management from planning to publishing.',
  integrations: 'Connect your social platforms, ChatGPT and Google Drive.',
  templates: 'Create consistent social media campaigns with reusable templates.',
  resources: 'Learn social media scheduling and AI-assisted publishing.',
  about: 'Meet AutoBrand AI, developed by Classic Technologies.',
  help: 'Support for social publishing, connections, AI and billing.',
  contact: 'Contact AutoBrand AI about your social media workflow.',
  security: 'Protected social accounts, publishing and workspace access.',
  privacy: 'How AutoBrand AI handles your connected account data.',
  terms: 'Terms for AutoBrand AI subscriptions and social publishing.'
};
const PUBLIC_PAGE_RELATED = {
  features: [['Integrations', '/integrations', 'Connect social accounts, ChatGPT and Google Drive.'], ['Templates', '/templates', 'Build reusable campaign workflows.'], ['Pricing', '/pricing', 'Compare available publishing and AI plans.']],
  integrations: [['Features', '/features', 'Understand how connected workflows operate.'], ['Security', '/security', 'Learn how credentials and permissions are protected.'], ['Help', '/help', 'Troubleshoot connection and publishing problems.']],
  templates: [['Resources', '/resources', 'Explore step-by-step content planning guides.'], ['Features', '/features', 'See content approvals, scheduling and Brand Brain.'], ['Pricing', '/pricing', 'Choose the plan that matches your workflow.']],
  resources: [['Templates', '/templates', 'Structure content and campaign briefs.'], ['Integrations', '/integrations', 'Connect the services used in your workflow.'], ['Help', '/help', 'Resolve publishing and setup problems.']],
  about: [['Features', '/features', 'Explore the social operating system.'], ['Security', '/security', 'Understand the built-in control model.'], ['Contact', '/contact', 'Speak with the team.']],
  help: [['Integrations', '/integrations', 'Check social network and storage connections.'], ['Security', '/security', 'Learn the account safety controls.'], ['Contact', '/contact', 'Request additional product support.']],
  contact: [['Pricing', '/pricing', 'Check current plan options.'], ['Help', '/help', 'Read support and troubleshooting guidance.'], ['Security', '/security', 'Find safe security reporting guidance.']],
  security: [['Privacy', '/privacy', 'Understand product data handling.'], ['Terms', '/terms', 'Read user responsibilities and provider limits.'], ['Help', '/help', 'Find support for account security.']],
  privacy: [['Security', '/security', 'Read the credential and access protections.'], ['Terms', '/terms', 'Review relevant subscription and service rules.'], ['Contact', '/contact', 'Ask about your account and data.']],
  terms: [['Pricing', '/pricing', 'Review current prices and plan entitlements.'], ['Privacy', '/privacy', 'Understand connected-service information.'], ['Contact', '/contact', 'Send a product or billing question.']]
};
for (const [key, heading] of Object.entries(PUBLIC_PAGE_HEADINGS)) {
  PUBLIC_PAGES[key].heading = heading;
  PUBLIC_PAGES[key].related = PUBLIC_PAGE_RELATED[key];
}


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
