# Publishing

This repository is ready to publish as an OpenClaw plugin package using the npm package name in `package.json`.

The npm package name and the OpenClaw plugin id should both stay aligned with `stella-timeline-plugin`.

## Required inputs

- `package.json` must already contain the package name you want to publish
- `package.json` must already contain the release version you want to publish
- npm authentication for that package name

## One-command maintainer flow

1. Update `package.json` with the release `name` and `version`.
2. Run:

```bash
npm run release -- --push
```

That command:

1. synchronizes the version across package metadata;
2. runs `npm run verify`;
3. runs `npm pack --dry-run`;
4. creates a git commit and tag.

Add `--publish` to publish directly to npm from your machine after verification:

```bash
npm run release -- --publish --push
```
