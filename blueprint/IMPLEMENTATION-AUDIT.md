# AI Autobrand Implementation Audit

Date: 2026-05-18

This audit compares the current codebase against `AI-Autobrand-Expanded-Blueprint.md`.

## Honest Summary

The app is now a substantially more complete MVP surface, but it is still not the full production SaaS described in the blueprint.

What works now is a real local product workflow: JWT auth, Google OAuth boundary, Brand Brain, AI generation with local fallback/OpenAI boundary, draft editing, scheduling, calendar controls, media library, Growth Studio, campaign draft creation, template video render manifests, clean video job manifests, avatar consent and avatar video jobs, approvals, team invitations, billing records, webhooks, analytics recommendations, social account mock/OAuth/manual-token boundary, diagnostics, and admin actions.

What still depends on external providers and credentials:

- Live OpenAI generation requires a key with active quota/billing.
- Live Cloudinary upload and asset transformations.
- Live Facebook/Meta OAuth requires a Business Login configuration or approved Page permissions; manual Page token connect is available.
- Instagram, YouTube, LinkedIn, TikTok, X/Twitter, and Pinterest OAuth/posting.
- Real payment processors.
- Real video rendering, stitching, voiceover, music, captions, and Cloudinary video output.
- Real avatar training/rendering provider.
- Real email delivery.

## Verification That Currently Passes

```powershell
node -e "require('./src/app'); console.log('APP_LOAD_OK')"
node scripts\smokeFeatureRoutes.js
npm.cmd run doctor
npm.cmd test
npm.cmd audit --omit=dev
```

Current results:

- App load: OK.
- Expanded feature smoke: `FEATURE_SMOKE_OK`.
- Media-powered workflow smoke now covers upload/save media, media analysis, consent acceptance, media-to-draft, media-to-AI-post, media-to-Growth-Studio-video-storyboard, media-to-clean-video-job, and media-to-avatar-source.
- Doctor: required checks OK; warnings only for optional/missing provider keys.
- Tests: Facebook auth URL, Business Login config, callback-domain checklist, Page token exchange, manual Page token connect, and feed publishing service tests pass.
- Production dependency audit: 0 vulnerabilities.

## Status By Blueprint Area

### 1. Auth

Current status: Working MVP plus provider boundary.

Working:

- JWT access and refresh cookies.
- Authorization Bearer support in `attachUser`.
- Hashed refresh tokens.
- Refresh rotation.
- Logout and logout all devices.
- Register/login.
- Email verification development flow.
- Forgot/reset password development flow.
- Google OAuth start/callback without sessions.
- CSRF protection for forms.
- Role middleware.

Still incomplete:

- Real email delivery.
- Fine-grained permission enforcement across every route.

### 2. Brand Brain

Current status: Mostly working MVP.

Working:

- Create/list/show/edit/update brands.
- Logo URL and Cloudinary direct-upload boundary.
- Business type, description, website, location, language, audience, tone.
- Products/services, offers/prices, social links, posting frequency.
- Goals, hashtags, blocked words, competitors, colors, font style, CTA, local style.
- Pain points, objections, testimonials, rules.
- AI and Growth Studio use Brand Brain fields.

Still incomplete:

- Rich row editors for products/offers/social links.
- Automatic best-performing post memory loop.

### 3. AI Content Generator

Current status: Working MVP with fallback.

Working:

- Generate post drafts.
- Save caption, title, hashtags, description, YouTube tags, and platform metadata.
- Platform/content type choices include WhatsApp, blog-to-social, real estate, restaurant, church, internet vouchers, testimonials, offers, and events.
- Hashtag generator.
- Video script generator.
- Campaign generator.
- OpenAI service boundary and local fallback.
- Configurable OpenAI model through `OPENAI_MODEL`.
- Live OpenAI health check through doctor/provider diagnostics.
- Graceful fallback when OpenAI returns quota/API errors.
- Credits and usage logs for core text generation.

Still incomplete:

- OpenAI account billing/quota must be active for live responses.
- True evaluator for content score.
- Regeneration/version history.

### 4. Campaign Generator

Current status: Working internal workflow.

Working:

- Campaign create/list.
- AI plan with pillars, times, and post ideas.
- Generate real draft posts from a campaign.
- Change campaign status: draft, active, paused, completed, archived.

Still incomplete:

- Drag/drop campaign calendar.
- Campaign analytics attribution.

### 5. Growth Studio

Current status: Working internal workflow.

Working:

- Campaign brief generator.
- 7-post draft batch generator.
- AI video storyboard generator.
- Hashtag pack generator.
- Competitor snapshot generator.
- Brand audit generator.
- Offer angles generator.
- Saved growth reports.

Still incomplete:

- Provider-powered research and live competitor data.

### 6. Media Library

Current status: Working MVP with creative task manifests.

Working:

- Save external asset URL.
- Cloudinary signature endpoint and direct-upload browser script.
- Search/filter/delete media.
- Attach media to posts.
- Consent status for real-person media.
- Prompt-from-media notes.
- Automatic metadata-based media insights on upload.
- Use uploaded image/video as source media in AI post generation.
- Create a draft directly from a media asset.
- Use uploaded media in Growth Studio draft/video workflows.
- Use uploaded media in clean video jobs and avatar source workflows.
- Background removal request manifests.
- 9:16, 1:1, and 16:9 resize/crop manifests.
- Image variant manifests.

Still incomplete:

- Live Cloudinary transformation testing.
- Real computer vision analysis, background removal, and variant rendering provider.

### 7. Posts And Calendar

Current status: Working MVP.

Working:

- Draft list/edit/delete.
- Title, description, caption, hashtags, platform, link, media.
- Platform preview with character limits, warnings, and posting tips.
- Duplicate across platform.
- Schedule/reschedule/cancel.
- Publish now.
- Calendar filters by brand/platform/status/view.
- Calendar edit/duplicate/publish/cancel actions.
- BullMQ/Redis scheduler boundary with safe fallback.

Still incomplete:

- True visual month/week/day calendar grid.
- Drag/drop rescheduling.
- Formal retry policy by platform/plan.

### 8. Social Posting

Current status: Provider boundary plus development mock.

Working:

- Social account model.
- Mock connections for Facebook, Instagram, YouTube, LinkedIn, TikTok, X/Twitter, Pinterest.
- Facebook OAuth URL/callback boundary.
- Facebook Business Login `config_id` OAuth path to avoid raw Page-scope rejection.
- Facebook callback-domain setup checklist to prevent Meta "Can't load URL" redirects.
- Settings/doctor diagnostics show the exact App Domain and Valid OAuth Redirect URI to add in Meta.
- Facebook OAuth code exchange to user access token.
- Facebook managed Page fetch through Graph API.
- Encrypted Facebook Page access token storage.
- Manual Facebook Page access-token validation and encrypted storage fallback.
- Live Facebook Page feed publishing for text/link posts.
- Live Facebook Page photo publishing for image posts with public image URLs.
- Token encryption helper.
- Disconnect/reconnect controls.
- Publishing worker calls Facebook provider boundary.

Still incomplete:

- Live OAuth/posting for other platforms.
- Token refresh automation.
- Browser-based Facebook OAuth needs a real Meta login test with `FACEBOOK_LOGIN_CONFIG_ID` or approved Page permissions.

### 9. Video System

Current status: Working job/manifest workflow, not final MP4 rendering.

Working:

- AI video job model.
- Automatic brand-to-video plans.
- Clean text-to-video job manifests.
- Uploaded image/video can be attached as source media and injected into scene prompts.
- Scene-by-scene prompts.
- Scene regeneration notes.
- Output URL/status updates.
- Cancel jobs.
- Create video drafts from jobs.
- Template video route with seeded templates.
- Template render manifests.
- Create video drafts from template renders.
- Credit deductions for premium video paths.

Still incomplete:

- Real video provider integration.
- Worker that renders/stitches MP4s.
- Voiceover/music/subtitle/watermark processing.
- Cloudinary video output pipeline.

### 10. Avatar / Clone Video

Current status: Working consent and job workflow, not provider rendering.

Working:

- Avatar profile create/list.
- Explicit ownership/permission confirmation.
- Uploaded media can be selected as avatar source after consent is accepted.
- AvatarConsent records with IP/user-agent.
- Script-to-avatar video job creation.
- Visible AI-generated disclosure included in job prompt.
- Revoke/delete workflow.

Still incomplete:

- Real avatar provider integration/training.
- Voice generation/upload.
- Rendered avatar output.

### 11. Approvals

Current status: Working internal workflow.

Working:

- Request approval for draft.
- Approve, reject, and request changes.
- Comment thread display.
- Add comments.
- Notifications for approval request/update.

Still incomplete:

- External client reviewer portal.
- Email notifications.

### 12. Team

Current status: Working development invite workflow.

Working:

- Invite records.
- Development invite links.
- Accept invite into logged-in account.
- Roles and permission labels.
- Role update.
- Remove team member.

Still incomplete:

- Real invite email delivery.
- Route-level permission enforcement everywhere.

### 13. Analytics

Current status: Internal analytics MVP.

Working:

- Analytics totals.
- Best platform signal.
- Failed/video post counts.
- Simple AI-style recommendations.

Still incomplete:

- Social platform analytics sync.
- Charts.
- Deep best-time/best-content detection.
- Campaign attribution.

### 14. Billing, Credits, And Webhooks

Current status: Working development billing workflow.

Working:

- Subscription model.
- Plan selection.
- Payment records.
- Manual checkout/invoice records.
- Mark paid.
- Credit grants on plan change.
- Credit ledger display.
- Webhook endpoint with optional HMAC signature validation.
- Webhook events logged.
- Credit usage for AI posts, AI tools, template renders, clean videos, and avatar jobs.
- Plan limits for brands, AI text, scheduled posts, videos, team invites, and social accounts.

Still incomplete:

- Pesapal live checkout.
- Provider-specific webhook signature schemes.
- Invoices/receipts from real processors.

### 15. Admin

Current status: More useful internal admin.

Working:

- Admin stats.
- Recent users.
- Suspend/activate/pending user status updates.
- Failed post list.
- Retry failed posts.
- Payments list.
- API logs list.
- Audit logs list.

Still incomplete:

- Full moderation workflows.
- Template management UI.
- Abuse reports.
- System setting editor.

### 16. UI

Current status: Working dashboard style.

Working:

- Public landing page.
- Sidebar dashboard.
- Light/dark theme toggle.
- Cards, forms, grids, empty states.
- Mobile responsive grid fallbacks.

Still incomplete:

- Mobile sidebar drawer.
- Charts and richer calendar visuals.

## Current Completion Estimate

Against the blueprint:

- MVP: roughly 65-75% complete as an internal/dev product.
- Full production platform: roughly 35-45% complete.

The remaining gap is mostly provider work, production-grade UI depth, live email/payments/social/video/avatar integrations, and formal tests.

## 2026-06-06 Pesapal Production Checkout Update

### Newly completed

- Public plan selection now starts at `/start/:planSlug` so landing-page pricing buttons work for guests and logged-in users.
- Register and login preserve the intended checkout destination through a safe `next` parameter.
- Paid signup no longer assigns the paid plan as active before payment is verified.
- Billing now includes a real Pesapal API 3.0 provider.
- Pesapal hosted checkout creation, token authentication, IPN support, callback support, and transaction-status verification are implemented.
- `/dashboard/billing/pesapal/ipn` is available without auth and bypasses CSRF so Pesapal can POST payment notifications.
- Checkout UI is now a clean onboarding-to-payment page instead of a manual invoice page.
- Payment records store provider reference, checkout URL, paid timestamp and failed timestamp.
- Billing page now distinguishes Pesapal production readiness from manual/internal payment handling.
- Environment templates include Pesapal deployment variables.

### Blueprint gaps closed by this update

- Payment provider integration is no longer just a placeholder.
- The onboarding route from plan selection to payment is now explicit.
- Pending paid subscription state is enforced before paid access is granted.
- Callback/IPN verification is required before activation.

### Still requires live credentials

- A real Pesapal sandbox or production payment cannot be completed until merchant credentials and IPN ID are configured.
- Live payment verification should be tested with a real public HTTPS domain before launch.
