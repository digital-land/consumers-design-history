/*
  Pure functions for turning a GitHub discussion into a design history post.
  Used by scripts/sync-discussions.js. No network or file system access here,
  so everything can be unit tested.
*/

import crypto from 'node:crypto'

import yaml from 'js-yaml'

// Author associations allowed to publish. Discussions in a public repo can be
// started by anyone, so a post is only published when it has the publish label
// (which only triagers and above can add) AND was written by someone in the
// organisation or a collaborator on the repo.
export const TRUSTED_AUTHOR_ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR']

// Images on these hosts are downloaded into the repo. Anything else is left
// as an external link.
const GITHUB_IMAGE_URL = /^https:\/\/(github\.com\/user-attachments\/assets\/|(private-)?user-images\.githubusercontent\.com\/)/

const IMAGE_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif'
}

const NO_RESPONSE = '_No response_'

export function isPublishable (discussion, publishLabel) {
  const labels = (discussion.labels?.nodes || []).map(label => label.name)
  return labels.includes(publishLabel) &&
    TRUSTED_AUTHOR_ASSOCIATIONS.includes(discussion.authorAssociation)
}

/*
  Discussion forms (.github/DISCUSSION_TEMPLATE/design-history.yml) save the
  body as markdown with a `### <label>` heading per field. Headings are matched
  in order, and may be missing (e.g. a discussion written before a field was
  added to the form). Everything after `### Post` is the post, so designers
  can use `###` headings in their own writing.

  A discussion not written with the form is treated as all post body.
*/
export function parseFormBody (body) {
  const lines = normaliseNewlines(body).split('\n')
  const sections = ['Summary', 'Date', 'Tags', 'Post']
  const found = {}
  let current = null
  let next = 0

  for (const line of lines) {
    const index = current === 'Post'
      ? -1
      : sections.findIndex((name, i) => i >= next && line.trim() === `### ${name}`)
    if (index !== -1) {
      current = sections[index]
      found[current] = []
      next = index + 1
      continue
    }
    if (current) found[current].push(line)
  }

  if (!found.Post) {
    const post = normaliseNewlines(body).trim()
    return { summary: firstParagraph(post), date: '', tags: [], post }
  }

  const value = name => {
    const text = (found[name] || []).join('\n').trim()
    return text === NO_RESPONSE ? '' : text
  }

  return {
    summary: value('Summary'),
    date: plainText(value('Date')),
    tags: value('Tags').split(',').map(tag => plainText(tag)).filter(Boolean),
    post: value('Post')
  }
}

/*
  Reads the optional date field. Accepts 2026-11-20 or 20/11/2026 (UK order)
  and returns YYYY-MM-DD, or null if empty or not a real date.
*/
export function parseDate (value) {
  const text = String(value || '').trim()
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const uk = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const [year, month, day] = iso
    ? [iso[1], iso[2], iso[3]]
    : uk ? [uk[3], uk[2], uk[1]] : []
  if (!year) return null

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null
  return date.toISOString().slice(0, 10)
}

/*
  Finds images in the post: markdown `![alt](src)` and the `<img>` tags GitHub
  inserts when you drag and drop a file. Returns them in order of appearance.
*/
export function findImages (markdown) {
  const images = []
  for (const match of markdown.matchAll(imagePattern())) {
    const image = match[1] !== undefined
      ? { alt: match[1], src: match[2] }
      : { alt: attribute(match[0], 'alt'), src: attribute(match[0], 'src') }
    if (image.src) images.push({ ...image, match: match[0] })
  }
  return images
}

export function isGithubImage (src) {
  return GITHUB_IMAGE_URL.test(src)
}

// Images are named by a hash of their URL, so the same image is never
// downloaded twice and its filename stays the same between syncs
export function imageHash (src) {
  return crypto.createHash('sha256').update(src).digest('hex').slice(0, 16)
}

export function imageFilename (src, contentType) {
  const extension = IMAGE_EXTENSIONS[(contentType || '').split(';')[0].trim()]
  if (!extension) return null
  return `${imageHash(src)}.${extension}`
}

// Reads the front matter of a generated post
export function readFrontMatter (contents) {
  const match = normaliseNewlines(contents).match(/^---\n([\s\S]*?)\n---/)
  return match ? yaml.load(match[1]) || {} : {}
}

/*
  Rewrites every image as a markdown image. `localFiles` maps a source URL to
  the file it was downloaded as; those images point at the local copy, which
  sits next to the post (so relative paths work with any path prefix).
*/
export function rewriteImages (markdown, localFiles) {
  return markdown.replace(imagePattern(), (whole, mdAlt, mdSrc) => {
    const alt = mdAlt !== undefined ? mdAlt : attribute(whole, 'alt')
    const src = mdSrc !== undefined ? mdSrc : attribute(whole, 'src')
    if (!src) return ''
    const file = localFiles.get(src) || src
    return `![${plainText(alt).replace(/[[\]]/g, '')}](${file})`
  })
}

/*
  The post body comes from a public discussion, and the site's markdown
  renderer allows things that can run scripts on the site:

  - raw HTML, e.g. `<script>`
  - markdown-it-attrs, where `text {onclick="..."}` adds HTML attributes

  Escape both so they show as text. Entities are used rather than backslashes
  so a backslash typed before them can't undo the escaping. Code blocks and
  inline code are left alone, because markdown already shows those literally.
*/
export function neutraliseMarkup (markdown) {
  let fence = null
  return markdown.split('\n').map(line => {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null
      return line
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      return line
    }
    return line.split(/(`+[^`]*`+)/).map((part, index) =>
      index % 2 ? part : part.replace(/<(?=[A-Za-z!?/])/g, '&lt;').replace(/\{/g, '&#123;')
    ).join('')
  }).join('\n')
}

// Strip characters that could be read as HTML from short text fields.
export function plainText (value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/*
  Builds the markdown file for a post. `post` is the already rewritten and
  escaped body.
*/
export function renderPost ({ discussion, summary, tags, post, date }) {
  const frontMatter = {
    title: plainText(discussion.title),
    description: plainText(summary) || plainText(discussion.title),
    date,
    tags,
    // Content comes from a discussion, so never run it through Nunjucks
    templateEngineOverride: 'md',
    discussion: {
      number: discussion.number,
      url: discussion.url
    }
  }

  if (discussion.lastEditedAt) {
    const modified = discussion.lastEditedAt.slice(0, 10)
    if (modified !== date) frontMatter.modified = modified
  }

  return `---
${yaml.dump(frontMatter, { lineWidth: -1, noRefs: true })}---
<!--
  Generated from ${discussion.url}
  Do not edit this file: edit the discussion instead, and this file will be
  updated automatically.
-->

${post.trim()}

---

[Read and comment on this post in GitHub Discussions](${discussion.url})
`
}

function imagePattern () {
  return /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)|<img\b[^>]*>/gi
}

function attribute (tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  if (!match) return ''
  return match[2] ?? match[3] ?? match[4] ?? ''
}

function firstParagraph (markdown) {
  const paragraph = markdown
    .split(/\n\s*\n/)
    .find(block => block.trim() && !/^\s*(#|!\[|<img|```|~~~)/i.test(block))
  return plainText((paragraph || '').replace(/[*_`[\]]/g, '')).slice(0, 300)
}

function normaliseNewlines (value) {
  return String(value || '').replace(/\r\n?/g, '\n')
}
