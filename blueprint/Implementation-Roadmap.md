# AI Autobrand Implementation Roadmap

## Build Estimate

Estimated calendar time for one strong full-stack developer:

- MVP: 21 to 30 working days
- Production beta with Facebook posting and analytics: 40 to 55 working days
- Full platform with billing, template videos, approvals, and multiple platforms: 70 to 100 working days
- Advanced clean AI video plus avatar/clone video: 100 to 140 working days total

If two developers work in parallel, a good beta can be reached in about 25 to 40 working days.

## Phase 1: Foundation

Duration: 3 to 5 days

Build:

- Express app
- MongoDB connection
- EJS layouts
- Public pages
- Dashboard shell
- Error pages
- Global CSS and JS
- Environment setup
- Logger

## Phase 2: JWT Auth

Duration: 4 to 6 days

Build:

- Register
- Login
- Logout
- Refresh token rotation
- Forgot/reset password
- Email verification
- Google OAuth
- Role middleware
- CSRF protection for cookie auth
- Admin seed

## Phase 3: Brand Brain

Duration: 4 to 6 days

Build:

- Brand model
- Brand CRUD
- Logo upload to Cloudinary
- Brand profile
- Brand voice fields
- Brand dashboard

## Phase 4: AI Generator

Duration: 5 to 8 days

Build:

- OpenAI service wrapper
- Post generation
- Hashtag generation
- CTA generation
- Image prompt generation
- Video script generation
- Save generated result as draft
- Usage logging
- Credit checks

## Phase 5: Posts And Calendar

Duration: 6 to 9 days

Build:

- Post model
- Draft posts
- Edit posts
- Delete posts
- Duplicate posts
- Schedule posts
- Calendar page
- Status filters
- Brand/platform filters

## Phase 6: Media Library

Duration: 3 to 5 days

Build:

- Cloudinary upload
- Media grid
- Search
- Filters
- Delete media
- Use media in posts

## Phase 7: Facebook Posting

Duration: 7 to 12 days

Build:

- Facebook OAuth
- Page connection
- Token encryption
- Publish text posts
- Publish image posts
- Scheduled queue worker
- Failed post logs
- Retry flow

## Phase 8: Analytics

Duration: 5 to 8 days

Build:

- Store post analytics
- Brand analytics
- Platform analytics
- Campaign analytics
- AI analytics explanation

## Phase 9: Template Videos

Duration: 10 to 18 days

Build:

- Video template model
- Template list
- Scene builder
- Script-to-template flow
- Render queue
- Cloudinary output
- Video preview

## Phase 10: Approval Workflow

Duration: 5 to 8 days

Build:

- Send for approval
- Client reviewer role
- Approve/reject/comment
- Approval history
- Notifications

## Phase 11: Billing And Credits

Duration: 7 to 12 days

Build:

- Plans
- Credit ledger
- Usage limits
- Payment provider integration
- Payment history
- Upgrade/downgrade

## Phase 12: Clean AI Video

Duration: 12 to 20 days

Build:

- Video provider abstraction
- Text-to-video job flow
- Brand-brain-to-video job flow
- Campaign-to-video job flow
- AI-generated scene planning
- Image-to-video job flow
- Scene regeneration
- Credit cost enforcement
- Generated video library

## Phase 13: Avatar / Clone Video

Duration: 15 to 25 days

Build:

- Avatar consent flow
- Avatar profile model
- Source media validation
- Provider job integration
- Script and voice flow
- Generated avatar video queue
- Deletion and consent audit controls

## Recommended First Sprint

Start with:

1. Project scaffold
2. JWT auth
3. Dashboard layout
4. Brand model
5. Brand CRUD
6. Cloudinary logo upload

This gives a clean foundation before expensive AI/video features are added.
