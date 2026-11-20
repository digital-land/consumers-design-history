# Design history for GOV.UK services

A place for you to document your GOV.UK service designs.

## Writing a post

Posts are written as [discussions](../../discussions/categories/design-history) in the **Design history** category. You don't need to use git or pull requests.

1. Go to [Discussions](../../discussions/categories/design-history) and select **New discussion**. Fill in the title, summary, date (optional), tags and post.
2. Drag and drop screenshots into the post where they should appear. After adding each one, replace the `alt="..."` text with a description of what the image shows.
3. When the post is ready, ask someone on the team to add the **publish** label. It appears on the site a few minutes later.

To change a post, edit the discussion. The site updates automatically, GitHub keeps every version of the discussion, and every published version is also committed to this repo. Use the discussion's comments to give feedback on a post.

To take a post down, remove the **publish** label or delete the discussion.

### Who can publish

A discussion is only published when it has the **publish** label, which only people with triage access or above can add, and was started by a member of the organisation or a collaborator on this repo. Anyone else's discussions are never published, even with the label.

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
