# AutoBrand AI Continuation Notes

This project is AutoBrand AI. Any notes from unrelated projects have been removed so future work starts from the correct product context.

## Completed Local End-To-End Upgrades

- Template video renders now create real local MP4 files and save matching Media records.
- Template render drafts now attach the rendered MP4 to the created video post.
- Calendar posts can be dragged to another day to reschedule through the existing schedule endpoint.
- Publishing failures now apply a platform-aware retry policy for temporary errors.
- Brand Brain performance memory now updates from synced Analytics records.
- Media resize and brand-variant actions now create actual local image outputs instead of only planned manifests.
- The lint script is Windows-safe and checks all JavaScript files through Node.

## Still Provider-Gated

- Live social publishing requires configured and approved provider apps.
- Hosted AI, clean video, avatar rendering, payment automation, and outbound email require real provider accounts and keys.
- Those are deployment/configuration blockers, not places where the app should silently pretend success.
