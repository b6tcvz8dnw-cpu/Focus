# GitHub Pages deployment migration

## Current production setting

The current Pages configuration was confirmed by the project owner:

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/ (root)`
- Public URL: https://b6tcvz8dnw-cpu.github.io/Focus/

The current production site must remain unchanged while the Vite migration is reviewed.

## Why the source must change

The Vite build writes the deployable site to `dist/`. The repository root is now a source tree containing `src/`, `public/`, and build configuration; it is not the correct production artifact directory. Continuing to publish `main / (root)` after merging the Vite migration would not publish the built PWA correctly.

The Pages deployment workflow builds `dist/` and publishes it using the official Pages artifact/deployment actions. Pull requests run the build but do not deploy. Only pushes to `main` and manual workflow dispatches can deploy.

## Safe cutover sequence

1. Keep the current production site on `main / (root)` while the pull request is a draft and device checks are pending.
2. Before merging the migration, open **Repository Settings → Pages → Build and deployment** and change **Source** from **Deploy from a branch** to **GitHub Actions**. Do not select a branch or folder after choosing Actions.
3. Confirm the setting is saved. Do not merge until the Pages source shows GitHub Actions.
4. Merge the reviewed pull request. The push to `main` starts the Pages workflow, which runs tests, builds `dist/`, and deploys that artifact.
5. In **Actions**, confirm the `FOCUS Pages deployment` run succeeds and its deploy job publishes the expected `https://b6tcvz8dnw-cpu.github.io/Focus/` URL.
6. Verify the live URL on iPhone Safari and from the Home Screen: launch, timer, break transition, Study Room, manifest/install behavior, offline launch, and preservation of existing local records.

## Rollback caution

Do not switch Pages back to `main / (root)` after the migration is merged. The root is a source tree, not the built site. If a deployment must be rolled back, redeploy a previously verified build artifact or restore a known-good release artifact through GitHub Actions. Keep the pre-migration backup branch and existing release artifact available until the new deployment is verified.

## Current status

- The Vite build and CI workflow are prepared on `refactor/foundation`.
- The Pages deployment workflow is configured to build on pull requests without deploying, and to deploy only from `main` or manual dispatch.
- The repository Pages setting itself is managed in GitHub Settings and has not been changed by this project work.
- No production deployment has been triggered by this migration work.
