# AI Autobrand Expanded Product Blueprint

Version: 1.0  
Date: 2026-05-16  
Product name: AutoBrand AI

## 1. Product Vision

AutoBrand AI is a multi-brand AI social media agent for businesses, creators, agencies, churches, schools, shops, restaurants, internet providers, real estate teams, hotels, travel companies, and personal brands.

The platform helps users create a brand brain, generate content, generate images and videos, schedule posts, publish to social platforms, manage approvals, track analytics, and reuse what performs well.

The strongest market position should be:

- Local business mode
- WhatsApp-ready content
- Brand brain memory
- Cheap template video generation
- Premium clean AI video generation
- Automatic AI-generated videos from text, brand brain, campaigns, products, and offers
- Upload-your-image clone/avatar video generation with consent protection
- Multi-platform scheduling and analytics

## 2. Core Stack

Use the requested stack:

- Node.js
- Express.js
- MongoDB
- Mongoose
- EJS
- HTML
- CSS
- JavaScript
- Cloudinary
- Google OAuth
- OpenAI API
- Redis and BullMQ for queues
- Social APIs for Facebook, Instagram, YouTube, LinkedIn, TikTok, X/Twitter, and Pinterest

## 3. Authentication Direction

Use JWT, not server sessions.

Rules:

- Do not use `express-session` for user login state.
- Use password hashing with bcrypt or argon2.
- Use short-lived access tokens.
- Use long-lived refresh tokens.
- Store refresh tokens hashed in MongoDB.
- Send browser JWTs through secure, httpOnly cookies for EJS pages.
- Support Authorization Bearer tokens for API/mobile clients later.
- Rotate refresh tokens on every refresh.
- Add logout that revokes the active refresh token.
- Add logout-all-devices that revokes all refresh tokens for the user.
- Add role and permission middleware based on decoded JWT claims plus database lookup when needed.
- Add CSRF protection for cookie-authenticated form actions.

Recommended token lifetime:

- Access token: 15 minutes
- Refresh token: 7 to 30 days depending on plan/security settings
- Password reset token: 15 minutes
- Email verification token: 24 hours

## 4. User Roles

- Super Admin: controls the whole platform.
- Agency Owner: manages many client brands, team members, approvals, analytics, and billing.
- Brand Owner: manages one or more brands.
- Content Creator: creates drafts, campaigns, scripts, media, and video ideas.
- Client Reviewer: approves, rejects, and comments on posts.
- Team Member: limited access based on assigned permissions.

## 5. Brand Brain

The brand brain is the core memory system. Every AI generation should use it.

Brand fields:

- Brand name
- Logo
- Business type
- Description
- Website
- Location
- Language
- Target audience
- Tone
- Products and services
- Prices and offers
- Business goals
- Preferred hashtags
- Blocked words
- Competitors
- Social links
- Posting frequency
- Brand colors
- Font style
- Preferred CTA
- Local business style
- Best performing posts
- Customer pain points
- Common objections
- Testimonials
- Brand rules

## 6. AI Content Generator

Generate:

- Facebook posts
- Instagram captions
- YouTube titles, descriptions, and tags
- TikTok captions
- LinkedIn posts
- X/Twitter posts
- WhatsApp status posts
- WhatsApp group promo messages
- Blog-to-social posts
- Product promotion posts
- Event announcements
- Church service posts
- Real estate posts
- Internet voucher posts
- Restaurant menu posts
- Offer posts
- Holiday posts
- Educational posts
- Testimonial posts

Each generation should return:

- Caption
- Hashtags
- CTA
- Image idea
- Image prompt
- Video script
- Short video title
- Platform-specific version
- Best posting time
- Content score
- Improvement suggestions
- Safety or spam risk notes

## 7. AI Campaign Generator

User input:

- Goal
- Duration
- Platforms
- Tone
- Posting frequency
- Brand
- Offer
- Target audience

Output:

- Campaign name
- Campaign goal
- Calendar
- Captions
- Hashtags
- Video scripts
- Image prompts
- CTAs
- Suggested posting times
- Content categories
- Repurposed versions per platform

Campaign types:

- Product launch
- New service
- Discount
- Holiday
- Weekend
- Event
- Awareness
- Lead generation
- Brand growth
- Flash sale
- Church event
- School announcement
- Internet voucher promo

## 8. Image Upload And AI Creative Workflows

Users should be able to upload brand assets and personal images.

Supported image workflows:

- Upload product image and generate ad captions.
- Upload product image and generate better product background ideas.
- Upload logo and generate branded post layouts.
- Upload person image and generate avatar/clone video concepts.
- Upload event poster and generate social variations.
- Upload menu or price list and generate content.
- Upload business photo and generate local business promos.
- Remove background.
- Resize/crop for each platform.
- Generate image prompt from uploaded image.
- Create image variants in the same brand style.

Safety rules:

- Validate file type and size.
- Scan for unsafe content where provider tooling allows it.
- Require ownership/permission confirmation before using personal images.
- Store consent metadata for clone/avatar workflows.

## 9. Video System

Build video in three levels.

### Level 1: Cheap Template Videos

This is the MVP video approach.

Flow:

- AI creates a short script.
- AI breaks the script into scenes.
- User selects a template.
- System fills template with text, logo, product image, CTA, price, phone, and website.
- Worker renders the video.
- Video is stored in Cloudinary.
- User schedules or publishes it.

Template types:

- Business promo
- Product promo
- Flash sale
- Quote video
- Event announcement
- Church service announcement
- Internet voucher ad
- Restaurant menu video
- Real estate property promo
- Hotel offer video
- Travel package video
- Testimonial video
- Before/after video
- Educational tip

Sizes:

- 9:16 for Reels, Shorts, TikTok
- 1:1 for feed posts
- 16:9 for YouTube and landscape posts

### Level 2: Clean AI Video Generation

This is the premium clean video generator.

Clean AI video must not depend only on uploaded images or uploaded videos. The system should support fully automatic AI video generation from brand data, text prompts, campaign goals, product offers, and AI-generated scenes.

Features:

- Full text-to-video generation from a user prompt.
- Brand-brain-to-video generation with no uploaded media required.
- Campaign-to-video generation from goal, offer, audience, and platform.
- Product-offer-to-video generation from text fields only.
- AI-generated scene ideas, shots, backgrounds, motion, and visual style.
- AI-generated image/keyframe prompts for each scene when the selected provider works better with image-guided video.
- Text-to-video prompt builder.
- Optional image-to-video from uploaded image.
- Optional video-to-video restyling from uploaded video.
- Brand style transfer for videos.
- Scene-by-scene generation.
- Clean transitions.
- Background music.
- Voiceover.
- Captions/subtitles.
- Logo watermark.
- Brand colors and CTA outro.
- Platform-specific exports.
- Regenerate one scene without regenerating the whole video.

Provider strategy:

- Wrap video providers behind `videoProviderService`.
- Store generation request, provider job ID, status, cost, prompt, scene plan, seed, and output URLs.
- Allow provider switching without changing controllers.
- Put clean AI video behind credits and paid plans.

Automatic video flow:

- User chooses brand, platform, goal, duration, style, and offer.
- AI creates a video brief.
- AI creates scene-by-scene prompts.
- System submits each scene or full prompt to the video provider.
- Worker tracks generation status.
- System stitches or stores provider output.
- System adds captions, voiceover, logo, and CTA outro.
- User previews, edits, schedules, or exports.

### Level 3: AI Clone / Avatar Video

Users upload their image or short training clip, then generate a talking clone/avatar video.

Important safety and trust rules:

- Require explicit user consent before avatar creation.
- Require user to confirm they own the image/video or have permission.
- Add "AI-generated" metadata and visible or optional watermark depending on plan/legal settings.
- Do not allow impersonation of public figures or people without permission.
- Keep clone/avatar video premium-only because it is expensive and high-risk.
- Store avatar consent version, source media, avatar status, and deletion controls.

Avatar video flow:

- User uploads image or short clip.
- System validates media.
- User accepts consent.
- System creates avatar profile.
- User writes or generates script.
- AI creates voiceover or user uploads voice.
- Worker submits avatar video job.
- User previews output.
- User approves, schedules, or exports.

Avatar video features:

- Talking presenter video.
- Product explainer.
- Local business owner announcement.
- Event invitation.
- Sales promo.
- WhatsApp-ready video.
- Subtitle generation.
- Script translation.
- Voice selection.
- Brand outro.

## 10. Post Editor

The post editor should allow:

- Edit caption
- Edit hashtags
- Edit title
- Edit description
- Add image
- Add video
- Add link
- Choose platform
- Preview platform style
- Choose schedule date
- Save as draft
- Send for approval
- Publish now
- Schedule later
- Duplicate across platforms

Statuses:

- draft
- pending_approval
- approved
- scheduled
- publishing
- published
- failed
- cancelled
- rejected

## 11. Calendar And Scheduling

Use BullMQ and Redis for production scheduling.

Calendar views:

- Monthly
- Weekly
- Daily
- List

Actions:

- Drag post to a new date
- Reschedule
- Edit
- Cancel
- Duplicate
- Publish now
- Filter by brand/platform/status

Publishing flow:

- User schedules post.
- Post becomes `scheduled`.
- Queue worker publishes at scheduled time.
- Success sets status to `published`.
- Failure sets status to `failed` and records the error.
- Retry worker retries based on plan and platform rules.

## 12. Social Posting

Start with Facebook Pages, then add Instagram Business and YouTube.

Rules:

- Never collect social media passwords.
- Use OAuth only.
- Store encrypted access and refresh tokens.
- Track token expiry.
- Show reconnect state when token expires.

Platforms:

- Facebook Pages
- Instagram Business
- YouTube
- LinkedIn Pages
- TikTok Business
- X/Twitter
- Pinterest

## 13. Analytics

Track:

- Views
- Likes
- Comments
- Shares
- Clicks
- Reach
- Engagement rate
- Post status
- Best platform
- Best time
- Best content type
- Top performing post
- Failed posts
- AI usage
- Video usage
- Credit usage

AI analytics summary:

- Explain performance in simple English.
- Recommend what to post next.
- Recommend better posting times.
- Suggest content to reuse.

## 14. Approval Workflow

Flow:

- Creator creates post.
- Post goes to `pending_approval`.
- Reviewer approves, rejects, or comments.
- Approved post can be scheduled.
- Rejected post returns to draft.

Features:

- Approval history
- Comments
- Request changes
- Client reviewer access
- Email/in-app notifications

## 15. Admin And Billing

Admin dashboard:

- Users
- Brands
- Posts
- Subscriptions
- Payments
- API usage
- AI usage
- Failed posts
- Reports
- Templates
- Social connections
- Abuse reports
- System settings
- Audit logs

Billing:

- Free
- Starter
- Pro
- Agency
- Enterprise later

Credit examples:

- Text post: 1 credit
- Image prompt: 1 credit
- Campaign: 10 credits
- Template video: 20 credits
- Clean AI video: 100+ credits
- Avatar/clone video: 200+ credits

Payment providers:

- Stripe
- Flutterwave
- Paystack
- Mobile Money later

## 16. Security

Include:

- JWT auth, not sessions
- Password hashing
- Google OAuth
- Protected routes
- Role permissions
- CSRF protection for cookie-based auth
- Rate limiting
- Input validation
- Upload validation
- Token encryption
- API key protection
- Audit logs
- Abuse reports
- Webhook signature validation
- Provider callback validation
- Admin action logging

## 17. Database Models

Core models:

- User
- RefreshToken
- Brand
- SocialAccount
- Post
- Campaign
- Media
- VideoTemplate
- VideoRender
- AiVideoJob
- AvatarProfile
- AvatarConsent
- Analytics
- Subscription
- UsageLog
- CreditLedger
- Notification
- TeamMember
- Approval
- ApprovalComment
- AuditLog
- ApiLog
- Payment
- WebhookEvent

## 18. Main Backend Routes

Core route groups:

- `/auth`
- `/dashboard`
- `/brands`
- `/posts`
- `/ai`
- `/campaigns`
- `/calendar`
- `/media`
- `/templates`
- `/videos`
- `/avatars`
- `/social`
- `/analytics`
- `/approvals`
- `/team`
- `/billing`
- `/notifications`
- `/admin`

Important routes:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /brands`
- `POST /brands`
- `GET /brands/:id`
- `PATCH /brands/:id`
- `DELETE /brands/:id`
- `POST /ai/generate-post`
- `POST /ai/generate-campaign`
- `POST /ai/generate-hashtags`
- `POST /ai/generate-video-script`
- `POST /posts`
- `PATCH /posts/:id`
- `POST /posts/:id/schedule`
- `POST /posts/:id/publish-now`
- `POST /media/upload`
- `POST /videos/template-render`
- `POST /videos/clean-generate`
- `POST /avatars/consent`
- `POST /avatars/create`
- `POST /avatars/:id/generate-video`
- `GET /social/facebook/connect`
- `GET /social/facebook/callback`
- `GET /admin`

## 19. UI Direction

Use a clean, classic, focused dashboard style.

Rules:

- Light and dark mode.
- Sidebar dashboard.
- Mobile sidebar menu.
- Small/standard readable font sizes.
- Simple tables.
- Clean forms.
- Clean modals.
- Useful empty states.
- Minimal colors: white, black, dark blue, and restrained accents.
- Avoid noisy gradients and overly decorative layouts.

Main UI components:

- Navbar
- Sidebar
- Stats cards
- Data tables
- Post cards
- Calendar
- Media grid
- Video render queue
- Avatar consent flow
- Modals
- Forms
- Tabs
- Dropdowns
- Toast messages
- Pagination
- Search and filters

## 20. MVP Scope

Build first:

1. JWT auth
2. Dashboard
3. Brand Brain
4. AI post generator
5. Draft saving
6. Draft editing
7. Scheduling
8. Calendar
9. Media upload
10. Admin dashboard

Then add:

11. Facebook Page auto-posting
12. Failed post retry
13. Analytics
14. Template videos

Premium after MVP:

15. Clean AI video generation
16. Automatic text-to-video generation
17. Clone/avatar video generation
18. Payments and credits
19. More social platforms

## 21. Final Positioning

AutoBrand AI should not be just another content generator. It should be a brand operating system for small businesses and agencies:

- It remembers the brand.
- It creates platform-specific content.
- It turns one idea into many posts.
- It creates cheap videos first and premium AI videos later.
- It schedules and publishes automatically.
- It explains analytics.
- It protects costs with credits and plan limits.
- It supports agencies with approvals and multi-brand workflows.
