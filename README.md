# Design history for GOV.UK services

A place for you to document your GOV.UK service designs.

## Writing a post

Posts are written as [discussions](../../discussions/categories/design-history) in the **Design history** category and published on the [design history site](https://digital-land.github.io/consumers-design-history/). You don't need to use git or pull requests.

To start a post you need **maintain** or **admin** access to this repo, because the category only lets maintainers start discussions. Anyone can comment. Ask a repo admin if you can't see the **New discussion** button.

### Start a post

1. Go to [Design history discussions](../../discussions/categories/design-history) and select **New discussion**.
2. Fill in the form:
   * **Title** – the post's title on the site
   * **Summary** – one or two sentences, shown in the list of posts and in search results
   * **Date** (optional) – the date shown on the post, as `20/11/2026` or `2026-11-20`. Leave it blank to use the date you start the discussion.
   * **Tags** (optional) – separated by commas, e.g. `local plans, user research`
   * **Post** – the post itself, in markdown. Use `##` for headings.
3. Drag and drop or paste screenshots into the post where they should appear. GitHub adds a line like `<img alt="Screenshot 2026-11-20 at 10.00.00" src="..." />`. Change the `alt="..."` text to describe what the image shows, for people using screen readers. Images can be PNG, JPEG, GIF, WebP or AVIF.
4. Select **Start discussion**. The post isn't on the site yet, so you can share it with the team for comments first.
5. When it's ready, add the **publish** label (in the discussion's sidebar), or ask someone on the team to. The post appears on the site a few minutes later, at `https://digital-land.github.io/consumers-design-history/discussions/<number>/`, where `<number>` is the number in the discussion's own web address.

### Change a post

Open the discussion, select **⋯** at the top right of the post, then **Edit**. Save your changes and the site updates a few minutes later. GitHub keeps every version of the discussion, and every published version is also committed to this repo.

When editing:

* the post shows the form's headings (`### Summary`, `### Date`, `### Tags` and `### Post`). Keep them, and keep your post below `### Post`, or the summary and tags can end up mixed into the post.
* `_No response_` under a heading means that field was left blank. You can leave it, or replace it with a value.
* to add an image, drop or paste it into the post below `### Post`. To remove one, delete its `<img ...>` line.
* only the post is published. Comments, and any images in them, stay on GitHub, so use comments for feedback and work in progress.

### Take a post down

Remove the **publish** label, delete the discussion, or move it to another category. The post comes off the site a few minutes later.

### Who can publish

A discussion is only published when it has the **publish** label, which only people with triage access or above can add, and its current version was written by someone with triage, write, maintain or admin access to this repo. That's the last person to edit it, or the author if it's never been edited. Anyone else's discussions are never published, even with the label.

If the author later leaves and loses access, their posts stay published as they are. Edits they make afterwards aren't published, but edits by anyone on the team are. A post only comes off the site when the label is removed, the discussion is deleted, or it's moved out of the category.

When a labelled post isn't published or updated for these reasons, the workflow run in the **Actions** tab shows a warning naming the person.

### How it works

The [deploy workflow](.github/workflows/deploy.yml) runs whenever a discussion changes. It runs [scripts/sync-discussions.js](scripts/sync-discussions.js), which writes each published discussion to `app/posts/discussions/<number>.md` and downloads its images into `app/images/discussions/<number>/`. It commits any changes to `main`, then builds and deploys the site. Runs are queued, never cancelled, so a deploy is never stopped part way through.

The files in `app/posts/discussions/` are generated, so don't edit them: changes are overwritten by the next sync. Posts are published at `/discussions/<number>/`, matching the discussion's number on GitHub, so the title and date can change without breaking links.

If a post can't be synced (for example, an image fails to download), the published version stays as it was, everything else still deploys, and the workflow run fails so the problem shows up in the **Actions** tab.

To run the sync locally:

```sh
GITHUB_TOKEN=$(gh auth token) node scripts/sync-discussions.js
```

### Posts written as files

The older posts in `app/posts/` are markdown files, and can still be edited on GitHub directly, or created with the [New post](../../actions/workflows/new-post.yml) action.

## Purpose of this project

This repository makes it easy to:

* screenshot your designs
* create pages of screenshots to document designs
* document designs using the [GOV.UK Design System](https://design-system.service.gov.uk/)
* print pages of designs
* make designs shareable and linkable

## Installation and getting started

Read our guide on how to [set up a design history](https://govuk-design-history.x-govuk.org/get-started/).

## Support

This project is maintained by a small number of volunteers working across government.

For questions about using a design history for your service, bug reports or feedback, [submit a new issue](https://github.com/x-govuk/govuk-design-history-template/issues/new).

## Technical notes

The design history uses the [GOV.UK Design System](https://design-system.service.gov.uk) and the [Eleventy](https://www.11ty.dev) static site generator with the [GOV.UK Eleventy Plugin](https://govuk-eleventy-plugin.x-govuk.org).
