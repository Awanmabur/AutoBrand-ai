# AutoBrand AI v1.6.3 — First Install and Deployment

This is the complete consolidated project. The stale lockfile is deliberately excluded so it cannot reinstall known-vulnerable packages.

Run the command block provided with the release from the project root. It regenerates a clean lockfile, verifies dependencies, runs the full tests/security gates, commits the exact dependency tree, and pushes it to GitHub.

After the lockfile is committed, Render build command:

```bash
npm ci --include=optional && npm audit --omit=dev
```

Render start command:

```bash
npm start
```
