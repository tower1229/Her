# Publishing

This repository is ready to publish as an OpenClaw plugin package using the npm package name `stella-timeline-plugin`.

The OpenClaw plugin id remains `timeline-plugin`; only the npm package name changes.

## Required inputs

- npm authentication for that package name
- A release version such as `2.0.0`

## One-command maintainer flow

```bash
npm run release -- --version 2.0.0 --package-name stella-timeline-plugin --push
```

That command:

1. synchronizes the version across package metadata;
2. updates `CHANGELOG.md`;
3. runs `npm run verify`;
4. runs `npm pack --dry-run`;
5. creates a git commit and tag.

Add `--publish` to publish directly to npm from your machine after verification:

```bash
npm run release -- --version 2.0.0 --package-name stella-timeline-plugin --publish --push
```
