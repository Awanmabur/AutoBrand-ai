# Social API Integration Setup

This build wires the scheduler and social dashboard to real OAuth/API connectors for:

- Facebook Pages
- Instagram Business/Creator accounts through Meta
- LinkedIn profile / accessible organization Pages
- TikTok account publishing
- YouTube Shorts upload
- WhatsApp Cloud API messaging
- Google Business Profile locations
- Pinterest Boards
- X / Twitter profiles
- Threads profiles
- Google sign-up / login

The archive intentionally does not include a real `.env` file or generated upload files. Use `.env.example` as the template, then paste your real keys into your private `.env` file on your machine/server.

## New in this build

### Google sign-up / login

The login and register pages already include the Google buttons. This build keeps that flow and documents the environment variables clearly.

```bash
GOOGLE_CLIENT_ID=your_google_web_client_id
GOOGLE_CLIENT_SECRET=your_google_web_client_secret
GOOGLE_CALLBACK_URL=https://your-domain.example/auth/google/callback
GOOGLE_OAUTH_TIMEOUT_MS=30000
GOOGLE_OAUTH_CONNECT_TIMEOUT_MS=30000
GOOGLE_OAUTH_DNS_ORDER=ipv4first
GOOGLE_OAUTH_PROXY=
GOOGLE_OAUTH_IP_FAMILY=
```

Google sign-up uses the server-side OAuth/OpenID Connect flow in `src/services/googleAuthService.js` and fetches the user's Google profile from the userinfo endpoint. If your browser returns to `/auth/google/callback` but Node logs `UND_ERR_CONNECT_TIMEOUT`, the Google client and callback are working; your backend cannot reach Google's token endpoint. Run `node scripts/checkGoogleOAuthNetwork.js` from the project folder. A fast HTTP 400 response means the network is reachable; a timeout means you need to fix DNS, VPN/firewall, or proxy access. On Windows networks with broken IPv6 routing, keep `GOOGLE_OAUTH_DNS_ORDER=ipv4first`. If your network requires a proxy, set `GOOGLE_OAUTH_PROXY=http://user:pass@proxy-host:8080` or set `HTTPS_PROXY`; proxy mode requires the `https-proxy-agent` package in your project dependencies.

### Google Business Profile

- Dashboard route: `/social/google-business/connect`
- Callback route: `/social/google-business/callback`
- Service file: `src/services/googleBusinessProfileService.js`
- Publishing path: Google Business Profile posts route to `publishGoogleBusinessPost`.
- Account model: each connected Google Business Profile location is saved as `businessAccountId|locationId`.

```bash
GOOGLE_BUSINESS_CLIENT_ID=your_google_web_client_id
GOOGLE_BUSINESS_CLIENT_SECRET=your_google_web_client_secret
GOOGLE_BUSINESS_CALLBACK_URL=https://your-domain.example/social/google-business/callback
GOOGLE_BUSINESS_SCOPES=https://www.googleapis.com/auth/business.manage
```

If `GOOGLE_BUSINESS_CLIENT_ID` and `GOOGLE_BUSINESS_CLIENT_SECRET` are blank, the app falls back to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Pinterest Boards

- Dashboard route: `/social/pinterest/connect`
- Callback route: `/social/pinterest/callback`
- Service file: `src/services/pinterestService.js`
- Publishing path: Pinterest posts route to `publishPinterestPin`.
- Account model: each accessible board is saved as a separate publishing destination.

```bash
PINTEREST_CLIENT_ID=your_pinterest_client_id
PINTEREST_CLIENT_SECRET=your_pinterest_client_secret
PINTEREST_CALLBACK_URL=https://your-domain.example/social/pinterest/callback
PINTEREST_SCOPES=boards:read,pins:read,pins:write,user_accounts:read
PINTEREST_CONTINUOUS_REFRESH=false
```

Pinterest publishing requires a public image URL on the post.

### X / Twitter

- Dashboard route: `/social/x/connect`
- Callback route: `/social/x/callback`
- Service file: `src/services/xService.js`
- Publishing path: X posts route to `publishXPost`.
- OAuth flow: OAuth 2.0 Authorization Code with PKCE.

```bash
X_CLIENT_ID=your_x_oauth2_client_id
X_CLIENT_SECRET=your_x_oauth2_client_secret
X_CALLBACK_URL=https://your-domain.example/social/x/callback
X_SCOPES=tweet.read tweet.write users.read offline.access
```

Optional aliases are also supported:

```bash
TWITTER_CLIENT_ID=your_x_oauth2_client_id
TWITTER_CLIENT_SECRET=your_x_oauth2_client_secret
TWITTER_CALLBACK_URL=https://your-domain.example/social/x/callback
TWITTER_SCOPES=tweet.read tweet.write users.read offline.access
```

This build posts text updates through the X v2 tweet creation endpoint. Media upload for X is not included yet.

### Threads

- Dashboard route: `/social/threads/connect`
- Callback route: `/social/threads/callback`
- Service file: `src/services/threadsService.js`
- Publishing path: Threads posts route to `publishThreadsPost`.
- Publishing flow: create a Threads media/text container, then publish the container.

```bash
THREADS_APP_ID=your_threads_api_app_id
THREADS_APP_SECRET=your_threads_api_app_secret
THREADS_CALLBACK_URL=https://your-domain.example/social/threads/callback
THREADS_SCOPES=threads_basic,threads_content_publish
THREADS_GRAPH_VERSION=v1.0
```

Threads OAuth should use a real HTTPS domain. For local testing, use an HTTPS tunnel or mapped HTTPS development domain.

## Existing connectors kept

### LinkedIn

LinkedIn profile/page publishing remains in place and was not downgraded.

```bash
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_CALLBACK_URL=https://your-domain.example/social/linkedin/callback
LINKEDIN_SCOPES=openid profile email w_member_social
LINKEDIN_VERSION=202605
```

### TikTok

```bash
TIKTOK_CLIENT_KEY=your_tiktok_client_key
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
TIKTOK_CALLBACK_URL=https://your-domain.example/social/tiktok/callback
TIKTOK_SCOPES=user.info.basic,video.upload,video.publish
```

### YouTube

```bash
YOUTUBE_CLIENT_ID=your_google_web_client_id
YOUTUBE_CLIENT_SECRET=your_google_web_client_secret
YOUTUBE_CALLBACK_URL=https://your-domain.example/social/youtube/callback
YOUTUBE_SCOPES=https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly
YOUTUBE_DEFAULT_PRIVACY=public
```

If YouTube variables are blank, the app falls back to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Instagram / Facebook / WhatsApp through Meta

```bash
FACEBOOK_APP_ID=your_meta_app_id
FACEBOOK_APP_SECRET=your_meta_app_secret
FACEBOOK_CALLBACK_URL=https://your-domain.example/social/facebook/callback
FACEBOOK_GRAPH_VERSION=v20.0
FACEBOOK_LOGIN_CONFIG_ID=your_business_login_config_id
FACEBOOK_ALLOW_CLASSIC_OAUTH=false
FACEBOOK_APP_DOMAINS=your-domain.example
FACEBOOK_SCOPES=pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,whatsapp_business_messaging,whatsapp_business_management,business_management
```

WhatsApp can also publish with global Cloud API credentials:

```bash
WHATSAPP_ACCESS_TOKEN=your_permanent_or_long_lived_whatsapp_token
WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_whatsapp_business_account_id
WHATSAPP_DEFAULT_TO=optional_default_recipient_in_international_format
```

Instagram, Facebook media posts, Pinterest, and Threads image posts need public HTTPS media URLs. Configure Cloudinary or set `PUBLIC_APP_URL` to a public HTTPS domain.

```bash
PUBLIC_APP_URL=https://your-domain.example
CLOUDINARY_CLOUD_NAME=optional_cloudinary_cloud
CLOUDINARY_API_KEY=optional_cloudinary_key
CLOUDINARY_API_SECRET=optional_cloudinary_secret
```

## Dashboard connection routes

- Facebook/Instagram/WhatsApp discovery: `/social/facebook/connect`
- Google Business Profile: `/social/google-business/connect`
- LinkedIn: `/social/linkedin/connect`
- Pinterest: `/social/pinterest/connect`
- TikTok: `/social/tiktok/connect`
- YouTube: `/social/youtube/connect`
- X / Twitter: `/social/x/connect`
- Threads: `/social/threads/connect`
- Manual API token connection: `/social/api-connect` for manual Instagram and WhatsApp token setup

## Files touched

- `.env.example`
- `INTEGRATION_SETUP.md`
- `src/config/env.js`
- `src/controllers/socialController.js`
- `src/models/SocialAccount.js`
- `src/routes/social.js`
- `src/services/googleBusinessProfileService.js`
- `src/services/pinterestService.js`
- `src/services/publishingService.js`
- `src/services/threadsService.js`
- `src/services/xService.js`
- `src/views/social/index.ejs`
- `src/views/social/show.ejs`
- `test/moreSocialPlatformsService.test.js`

## Validation

Ran:

```bash
node --test test/*.test.js
```

Result:

```text
45 passing, 0 failing
```

## Production notes

- Do not commit real `.env` values to version control.
- Most platforms require app review or product access before publishing to real customer accounts.
- Redirect/callback URLs in the provider console must match the `.env` values exactly.
- OAuth publishing usually requires HTTPS in production.
- LinkedIn profile publishing is already configured; this build focuses on the remaining page/profile/board/location connectors requested.
