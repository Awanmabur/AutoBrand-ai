# Integration Setup

This document maps the provider configuration expected by the current source tree. Register the exact production HTTPS callback URLs in each provider console. Do not use localhost callback URLs in production.

## Google sign-in

Environment:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://your-domain.example/auth/google/callback
```

The callback is for authentication only. Linking Google to an existing account must start from the authenticated settings flow and is protected by purpose-bound OAuth state and step-up authentication.

## Facebook Pages and Instagram Business

Environment:

```env
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_CALLBACK_URL=https://your-domain.example/dashboard/actions/social/facebook/callback
FACEBOOK_GRAPH_VERSION=v25.0
FACEBOOK_LOGIN_CONFIG_ID=
FACEBOOK_ALLOW_CLASSIC_OAUTH=false
FACEBOOK_APP_DOMAINS=your-domain.example
FACEBOOK_SCOPES=pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,instagram_manage_insights,business_management
```

Connect route:

```text
/dashboard/actions/social/facebook/connect
```

Instagram uses the Facebook/Meta connection and requires a linked Instagram Business account plus the required Instagram permissions. Older/unverifiable grants are marked reconnect-required rather than treated as connected.

## TikTok

```env
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_CALLBACK_URL=https://your-domain.example/dashboard/actions/social/tiktok/callback
TIKTOK_SCOPES=user.info.basic,video.upload,video.publish,video.list
```

Connect route:

```text
/dashboard/actions/social/tiktok/connect
```

The OAuth flow uses PKCE. Publishing may remain in provider-processing state until TikTok returns a completed public post ID; analytics synchronization then resolves real post metrics.

## YouTube

```env
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_CALLBACK_URL=https://your-domain.example/dashboard/actions/social/youtube/callback
YOUTUBE_SCOPES=https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly
YOUTUBE_DEFAULT_PRIVACY=public
```

`YOUTUBE_CLIENT_ID`/`SECRET` may fall back to the Google OAuth client values when intentionally configured that way.

Connect route:

```text
/dashboard/actions/social/youtube/connect
```

## LinkedIn

```env
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_CALLBACK_URL=https://your-domain.example/dashboard/actions/social/linkedin/callback
LINKEDIN_SCOPES=openid profile email w_member_social
LINKEDIN_VERSION=202607
```

Connect route:

```text
/dashboard/actions/social/linkedin/connect
```

Organization analytics and member/profile analytics are treated as different capabilities. Unsupported analytics combinations remain unavailable instead of returning fabricated zeros.

## Google Business Profile

```env
GOOGLE_BUSINESS_CLIENT_ID=
GOOGLE_BUSINESS_CLIENT_SECRET=
GOOGLE_BUSINESS_CALLBACK_URL=https://your-domain.example/dashboard/actions/social/google-business/callback
GOOGLE_BUSINESS_SCOPES=https://www.googleapis.com/auth/business.manage
```

Connect route:

```text
/dashboard/actions/social/google-business/connect
```

The dedicated client values may intentionally fall back to the base Google OAuth credentials when left blank.

## Pinterest

```env
PINTEREST_CLIENT_ID=
PINTEREST_CLIENT_SECRET=
PINTEREST_CALLBACK_URL=https://your-domain.example/dashboard/actions/social/pinterest/callback
PINTEREST_SCOPES=boards:read,pins:read,pins:write,user_accounts:read
PINTEREST_CONTINUOUS_REFRESH=true
```

Connect route:

```text
/dashboard/actions/social/pinterest/connect
```

## X / Twitter

```env
X_CLIENT_ID=
X_CLIENT_SECRET=
X_CALLBACK_URL=https://your-domain.example/dashboard/actions/social/x/callback
X_SCOPES=tweet.read tweet.write users.read offline.access media.write
```

`TWITTER_*` aliases are supported for deployments already using that naming convention.

Connect route:

```text
/dashboard/actions/social/x/connect
```

## Threads

```env
THREADS_APP_ID=
THREADS_APP_SECRET=
THREADS_CALLBACK_URL=https://your-domain.example/dashboard/actions/social/threads/callback
THREADS_SCOPES=threads_basic,threads_content_publish,threads_manage_insights
THREADS_GRAPH_VERSION=v1.0
```

Connect route:

```text
/dashboard/actions/social/threads/connect
```

## Media hosting required by providers

Generated media must use durable production storage:

```env
GENERATED_MEDIA_STORAGE=gridfs
PUBLIC_APP_URL=https://your-domain.example
```

or Cloudinary:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Provider-fetched assets must be reachable over public HTTPS. Local-disk generated-media persistence is rejected in production.

## Credential security

Provider access/refresh tokens are encrypted before database persistence using `TOKEN_ENCRYPTION_KEY`. Keep the active key stable across deployments. During rotation, place old keys temporarily in `TOKEN_ENCRYPTION_KEY_PREVIOUS`. Never package either value in the release archive.

## Verification after connection

After configuring provider applications and connecting real accounts:

1. Run `npm run diagnose:publishing -- --limit=10 --live`.
2. Confirm the account health state is Connected and required permissions are present.
3. Publish a controlled test asset.
4. Confirm a real provider result ID is stored.
5. Confirm analytics synchronization either writes real metrics or an explicit unsupported/unavailable state.
6. Disconnect the test destination and confirm scheduled content is reconciled by brand, not creator.

Historical `mock` accounts are never treated as connected and must be replaced by real provider connections.
