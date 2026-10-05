# AI Cost Control

## Billing boundary

AI consumption is charged to the selected brand's paying workspace. The employee is recorded as actor but does not supply a separate personal credit pool.

## Subscription-period credits

Each plan defines `includedCredits`. `Subscription.creditsUsed` tracks consumption for that entitlement period. Credit reservation is atomic so concurrent requests cannot simply overspend the remaining balance.

`CreditLedger` records workspace owner, actor, brand, reason, reference and resulting balance.

## What consumes AI credits

Provider-backed AI text/image/video/avatar operations consume configured credits plus their explicit plan quota.

## What does not consume AI credits

- manual posts/imports;
- deterministic validation/scoring where implemented without a generative provider;
- local template-video rendering;
- local media transformations such as compression/background processing where implemented locally;
- scheduling/publishing infrastructure itself.

## Failure accounting

A provider failure must not manufacture successful output. Charge timing should correspond to the service's deliberate accounting policy and should not create hidden repeat charges during internal retries.

## Observability

Track AI usage by plan, workspace, actor, capability and provider. Publish usage should be separately measurable so gross margin can be compared with AI tiers.
