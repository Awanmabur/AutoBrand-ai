# Media Pipeline

## Ownership

Every media asset belongs to a brand and records the uploader independently. Team members may use shared media only through brand permission.

## Ingestion

Uploads and supported remote imports enforce size/type rules. Remote URLs use the SSRF-safe fetch service; browser-declared MIME types are not trusted as proof of returned content.

## Storage

Generated media is persisted to durable MongoDB/GridFS and/or configured Cloudinary storage. Local files may be used only as temporary renderer working files; production fails closed if a durable write cannot be completed. `GENERATED_MEDIA_STORAGE=local` is development-only and rejected by production validation.

## Transformations

Deterministic local transformations use Sharp/FFmpeg. Background removal creates a real transparent derivative rather than a placeholder request. Template video generation produces actual MP4 output.

## Native runtime requirements

Production installation must include Linux-compatible Sharp optional dependencies and a usable `ffmpeg-static` binary. `npm run preflight:runtime` fails the deployment when they are unavailable.

## Lifecycle

Archived media is not selectable for new publishing. Account/workspace deletion removes media according to the data lifecycle. Production release packages exclude runtime upload/generated directories entirely.
