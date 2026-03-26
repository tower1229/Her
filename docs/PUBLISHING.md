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
npm run release -- --dry-run
```

That command:

1. synchronizes the version across package metadata;
2. refreshes generated holiday data with `npm run generate:holidays` (`releaseYear-1` through `releaseYear+10`, CN/US);
3. runs `npm run verify`;
4. runs `npm publish` with the args you pass to `npm run release -- ...`.

Publish after dry-run validation:

```bash
npm run release
```
