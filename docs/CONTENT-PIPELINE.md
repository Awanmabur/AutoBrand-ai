# Content Pipeline

## Content sources

Posts distinguish `manual`, `ai` and `import` content sources. Creation mode is not allowed to silently switch sources behind the user.

## Manual flow

```text
brand access -> entitlement/quota -> exact caption/media validation
-> destination resolution -> optional approval -> draft/schedule/publish queue
```

Manual media must belong to the same brand and be usable/non-archived. Image posts require images, video posts require video, and carousels require multiple valid images.

## AI flow

```text
brand access -> AI entitlement/quota/credits -> generation job
-> provider -> validated output -> Media/Post -> review/approval -> scheduling
```

Queued AI jobs preserve actor, billing workspace and required permission. Workers revalidate the business context before delayed actions.

## Campaigns

Campaigns are brand-owned. Existing user/campaign copy is preserved where possible; AI should generate only genuinely missing creative instead of regenerating available content and wasting credits.

## Approval boundary

Approval state is durable. Approval records carry brand/workspace context. If an approved post is configured for publish-after-approval, the dispatch path still enforces the publishing/tenant boundaries.
