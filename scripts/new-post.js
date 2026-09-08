/*
  Creates the skeleton for a new design history post: a post markdown file
  with front matter, and an images folder with a README explaining how to
  add screenshots.

  Used by the "New post" GitHub Action (.github/workflows/new-post.yml),
  but can also be run locally:

  SLUG=my-new-post node scripts/new-post.js
  SLUG=my-new-post TITLE="My new post" TAGS="research, prototyping" node scripts/new-post.js
*/

import fs from 'node:fs'

const slug = (process.env.SLUG || '').trim().toLowerCase()
const titleInput = (process.env.TITLE || '').trim()
const tagsInput = (process.env.TAGS || '').trim()

if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  fail(`Slug "${process.env.SLUG || ''}" is invalid. Use lowercase letters, numbers and hyphens only, e.g. "designing-search-page".`)
}

const title = titleInput || titleCase(slug)

const tags = tagsInput
  .split(',')
  .map(tag => tag.trim())
  .filter(Boolean)

const date = new Date().toISOString().slice(0, 10)

const imageDirectory = `app/images/${slug}`
const postPath = `app/posts/${date}-${slug}.md`

if (fs.existsSync(postPath)) {
  fail(`A post already exists at ${postPath}. Choose a different slug.`)
}

if (fs.existsSync(imageDirectory)) {
  fail(`An images folder already exists at ${imageDirectory}. Choose a different slug.`)
}

fs.mkdirSync(imageDirectory, { recursive: true })
fs.writeFileSync(`${imageDirectory}/README.md`, imagesReadme())
fs.writeFileSync(postPath, postTemplate())

console.log(`Created ${postPath}`)
console.log(`Created ${imageDirectory}/README.md`)

setOutput('slug', slug)
setOutput('title', title)
setOutput('post-path', postPath)
setOutput('image-directory', imageDirectory)

function titleCase (value) {
  const words = value.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function yamlQuote (value) {
  return JSON.stringify(value)
}

function postTemplate () {
  const tagsYaml = tags.length
    ? `[${tags.map(yamlQuote).join(', ')}]`
    : '[]'

  return `---
title: ${yamlQuote(title)}
description: |-
  A short summary of this post

  A longer paragraph describing what this post covers, for listings and search results.
date: '${date}'
screenshots:
  items:
  - text: Describe this screenshot
    src: 01-example.png
    alt: Describe what this screenshot shows, for people using a screen reader
    caption: A caption shown underneath the screenshot
tags: ${tagsYaml}
---

## Heading

Write your post content here.

![Describe what this screenshot shows](/${slug}/01-example.png)
`
}

function imagesReadme () {
  return `# Images for "${title}"

Add screenshots for this post here, then reference them from
\`app/posts/${date}-${slug}.md\`.

## How to add images

1. Drag and drop your image files into this folder (you can do this
   directly on GitHub: open this folder on the post's branch, then use
   **Add file > Upload files**).
2. Name each file with a two-digit number prefix showing the order it
   should appear in, e.g. \`01-original-page.png\`, \`02-new-design.png\`.
3. For each image, copy this into the \`screenshots.items\` list in the
   post's front matter, then fill in the placeholders:

   \`\`\`yaml
   - text: Describe this screenshot
     src: 02-your-image.png
     alt: Describe what this screenshot shows, for people using a screen reader
     caption: A caption shown underneath the screenshot
   \`\`\`

4. Reference the image from the post body too, e.g.
   \`![Alt text](/${slug}/02-your-image.png)\`.
5. Delete this README once the post is ready, and mark the pull request
   ready for review.

See [CLAUDE.md](../../../CLAUDE.md) for more on the post format.
`
}

function setOutput (name, value) {
  if (!process.env.GITHUB_OUTPUT) return
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
}

function fail (message) {
  console.error(message)
  process.exit(1)
}
