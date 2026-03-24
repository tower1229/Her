# Publishing

This repository is ready to publish as an OpenClaw plugin package using the npm package name in `package.json`.

The OpenClaw plugin id remains `timeline-plugin`; only the npm package name changes.

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
2. updates `CHANGELOG.md`;
3. runs `npm run verify`;
4. runs `npm pack --dry-run`;
5. creates a git commit and tag.

Add `--publish` to publish directly to npm from your machine after verification:

```bash
npm run release -- --publish --push
```
