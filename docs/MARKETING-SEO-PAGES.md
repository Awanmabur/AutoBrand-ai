# AutoBrand AI marketing pages: shared design and SEO

## Design ownership

- `src/views/public/partials/marketing-nav.ejs` and `marketing-footer.ejs` are the shared navigation and footer used by the homepage, pricing and all public informational pages.
- Keep the approved homepage layout and animations in `src/views/public/landing.ejs`. Do not fork another header or footer in informational templates.
- `src/views/public/seoPage.ejs` renders the ten public product/company/support pages using `public/css/landing.css` plus the namespaced `public/css/public-site.css` for its information-page sections.
- `public/js/marketing-pages.js` provides the matching responsive navigation, keyboard dismissal and theme toggle for standalone informational pages. The homepage retains its existing navigation script.
- Revisions to shared marketing CSS used by both page types should include a corresponding version query in the stylesheet references to avoid cached mobile regressions.

## Content and search behavior

- `src/services/publicSite.service.js` owns the existing page copy and the additional product-led guides, steps, FAQs, page-specific SEO titles, descriptions and contextual internal links.
- Use the public name **AutoBrand AI** consistently. Prefer audience-intent phrases in headings and descriptions, such as *AI social media management*, *social media scheduling*, *Brand Brain*, *social publishing approvals*, *ChatGPT integration*, *Google Drive media storage* and *social media analytics*.
- Do not add keyword-stuffed hidden copy, fabricated testimonials, follower guarantees, social provider features not available to the account, or fake pricing.
- The `/pricing` and individual plan pages show current pricing and entitlements from database-backed plans; do not hardcode prices into other marketing pages.
- Provider scopes, account eligibility, API availability, plan limits and approval rules qualify capability claims.
- `src/controllers/publicController.js` emits WebPage, BreadcrumbList and visible-FAQ structured data for these routes. Keep FAQ schema synchronized with visible FAQs.
- The contact form remains a real POST to `/contact` and retains its CSRF field. Do not replace it with a disconnected mock.
- Authenticated dashboards, payment flows and private tokens are excluded from public page content.

## Release checks

Run the focused test:

```bash
node --test test/marketingPublicLayoutSeo.test.js
```

Also run the existing marketing, SEO and CSP source tests:

```bash
node --test test/finalProductionHardeningV150.test.js test/planFormAndCleanup.test.js test/planOnboardingClarity.test.js
```

Inspect real browser layouts at widths **320, 375, 390, 768 and 1280 pixels**, including dark mode. Check that the mobile menu opens and dismisses with the button, outside click and Escape; the Resources CTA remains legible; and Contact, Security and Privacy links never overlap.

Before deployment, identify the actual hosting/runtime, test the release in isolation and retain the current release for rollback. After deployment, check `/`, `/features`, `/integrations`, `/templates`, `/resources`, `/help`, `/about`, `/contact`, `/security`, `/privacy`, `/terms`, `/pricing`, `/robots.txt`, `/sitemap.xml` and `/readyz`. Validate the contact form through a permitted test submission, without using real customer information.
