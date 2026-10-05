# Publish — US$10 · 1 month access

> Compatibility note: the database slug remains `manual-publisher` and this filename is retained to avoid breaking old internal links.

## Product goal

Publish lets customers bring their own creative work or connect ChatGPT/Codex while AutoBrand supplies the social operating infrastructure. This reduces AI-provider cost for both the customer and AutoBrand without turning the plan into a low-value scheduler.

## Current plan shape

- US$10 for 1 month of access. Payment is made through Pesapal for each access period; AutoBrand does not automatically charge the next period.
- 2 brands.
- 6 social accounts.
- 2 team members.
- 300 scheduled posts per billing/usage period defined by the plan service.
- 1,000 manual/imported posts.
- 100 handoff posts.
- 50 client approval links.
- 5 GB media.
- 0 AI text generations.
- 0 AI image generations.
- 0 AI video generations.
- 0 avatar videos.
- 0 AI credits.

## Included bring-your-own-AI / zero-AutoBrand-credit workflow

Users can write exact captions/ads, upload their own images/videos, or connect ChatGPT/Codex to create/manage assets and posts. Assets can be stored in AutoBrand, Google Drive, or both. Users can build carousels, select destinations, preview/validate, save drafts, schedule, publish now, run approvals, use the calendar, recover failed posts and review real provider analytics by channel.

The UI intentionally hides AI provider/model/generate/regenerate controls when the workspace does not own AI entitlement. The backend independently blocks AI calls.

## Bulk CSV import

The import pipeline validates the complete batch before inserting. It verifies workspace permission, manual/bulk entitlement, quotas, target destinations, media IDs belonging to the same brand, post-type/media compatibility and scheduling constraints. Imported rows are tagged as import/manual source and explicitly no-AI.

## Local template video

Publish can render deterministic videos from its own copy and brand settings.

```text
User headline/offer/CTA
      + Brand Brain colors/name
      + saved VideoTemplate
      -> Sharp frame
      -> FFmpeg MP4
      -> durable Media
```

This consumes zero AI credits. The render form validates required copy, URL protocols, lengths, workspace permissions, template entitlement, storage limits and selected template state.

## Cost-control invariant

The AutoBrand Publish pipeline must never “helpfully” fall back to an AutoBrand-billed generative-AI provider. Missing media or required content is a validation error, not a reason to call an AI provider.

## ChatGPT operator boundary

Connecting ChatGPT/Codex does not grant unlimited platform authority. MCP OAuth scopes, workspace RBAC, plan limits, provider readiness, approvals and normal publishing audit logs still apply. ChatGPT is an operator through AutoBrand, not a bypass around AutoBrand.
