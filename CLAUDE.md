# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and run

- `npm run build` builds the site to `_site/`
- `npm start` builds then serves with live reload
- `npm run test` runs Standard (JS code style linter) and the unit tests in `tests/` (`node --test`)

## Adding posts

New posts are GitHub Discussions in the `design-history` category, synced into the repo by `scripts/sync-discussions.js` (run by `.github/workflows/deploy.yml`). Only discussions with the `publish` label and a trusted author (`OWNER`, `MEMBER` or `COLLABORATOR`) are published. The form designers fill in is `.github/DISCUSSION_TEMPLATE/design-history.yml`. See the README for the designer workflow.

- Generated posts go in `app/posts/discussions/`, with images in `app/images/<slug>/` named by a hash of the image URL. They're overwritten on every sync, so never edit them by hand; change the sync instead.
- Posts are matched to discussions by `discussion.number` in front matter, which keeps the file name (and URL) stable when a title changes.
- Discussion content is untrusted (public repo). `neutraliseMarkup` in `scripts/lib/discussion-post.js` escapes raw HTML and `{...}` (markdown-it-attrs can add event handlers), and posts use `templateEngineOverride: md` so Nunjucks never runs on them. Keep both if changing the sync.
- Eleventy drops the date from `page.filePathStem`, so posts are served at `/<slug>/`, and their images sit in the same folder.

Older posts live in `app/posts/` as `YYYY-MM-DD-slug.md` with YAML front matter (title, description, date, screenshots, tags). Images go in `app/images/slug/` with `01-`, `02-` prefixes.

Generate a post from a folder of images: `node scripts/generate.js slug`

## Forking / changing GitHub org

This repo was forked from [x-govuk/govuk-design-history-template](https://github.com/x-govuk/govuk-design-history-template). If you move it to a different GitHub org or rename it, update `url` and `pathPrefix` in `eleventy.config.js` to match the new GitHub Pages URL.

## Tech stack

- Eleventy 3 static site generator with Nunjucks templates
- `@x-govuk/govuk-eleventy-plugin` provides GOV.UK Design System styling
- Site config in `eleventy.config.js`, templates in `app/_layouts/`, components in `app/_components/`
- Images are passthrough-copied from `app/images/` to the site root
