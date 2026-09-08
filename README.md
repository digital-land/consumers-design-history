# Design history for GOV.UK services

A place for you to document your GOV.UK service designs.

## Adding and editing posts on GitHub

You don't need to set up anything locally to add or edit a post — posts are just markdown files, and everything can be done from the GitHub web UI.

* **Editing an existing post** — open the post's file under [app/posts](app/posts) or its images under [app/images](app/images), and use GitHub's edit or upload buttons to make changes directly, or add screenshots.
* **Creating a new post** — run the [New post](../../actions/workflows/new-post.yml) action (from the **Actions** tab, select it and click **Run workflow**), giving it a slug for the post. This generates the post template and an images folder on a new branch and opens a pull request, which you can then edit and upload screenshots to on GitHub before marking it ready for review.

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
