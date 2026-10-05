# SEO and AI Discovery

AutoBrand AI treats public discovery and private application data as separate security zones.

## Public indexable surfaces

The public site exposes canonical, crawlable pages for:

- `/`
- `/features`
- `/pricing` and individual plan pages
- `/integrations`
- `/templates`
- `/resources`
- `/about`
- `/help`
- `/contact`
- `/security`
- `/privacy`
- `/terms`

Each public page receives a canonical URL, meta description, robots policy, Open Graph/Twitter metadata, and JSON-LD. The shared schema set contains `Organization`, `SoftwareApplication`, and `WebSite` entities based only on claims visible on the public site.

## Discovery files

The application serves these before database-dependent middleware so crawlers can still discover policy during a database incident:

- `/robots.txt`
- `/sitemap.xml`
- `/llms.txt`
- `/llms-full.txt`
- `/.well-known/security.txt`

`robots.txt` allows ordinary public crawling and explicitly protects `/dashboard`, `/auth`, `/mcp`, `/review`, `/uploads`, `/health`, and `/readyz`.

The default production policy permits search/discovery crawlers while opting out of known training-specific crawlers when `ALLOW_AI_TRAINING_CRAWLERS=false`:

- allow `OAI-SearchBot`
- allow `OAI-AdsBot`
- allow `Applebot`
- allow `Claude-SearchBot`
- disallow `GPTBot`
- disallow `ClaudeBot`
- disallow `Google-Extended`
- disallow `Applebot-Extended`

Set `ALLOW_AI_TRAINING_CRAWLERS=true` only after an explicit business decision.

## Private noindex boundary

Authenticated, token-bearing, operational, and media routes receive `X-Robots-Tag: noindex, nofollow, noarchive`. The HTML pages behind authentication are not included in the sitemap.

Never place OAuth authorization codes, review tokens, payment callbacks, media bearer tokens, or account-specific URLs in public sitemap/structured-data output.

## CDN / WAF deployment

Robots rules are not enough if the CDN or WAF returns 403/challenge pages to legitimate search crawlers. During production launch, verify the public routes with the crawler user agents used by the search providers you intend to support and review WAF rate-limit/bot rules.

## Search launch checks

1. Verify all canonical URLs resolve on the production hostname with HTTPS.
2. Verify public routes return 200 without cookies or JavaScript challenges.
3. Verify private routes are omitted from sitemap and carry noindex headers.
4. Validate JSON-LD using Google's Rich Results Test / Schema validator where applicable.
5. Submit `/sitemap.xml` to Google Search Console after deployment.
6. Re-test `robots.txt` after every CDN/WAF migration.
7. Do not add fabricated ratings, testimonials, prices, usage numbers, or unsupported structured-data claims.
