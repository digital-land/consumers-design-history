/*
  Syncs design history posts from GitHub Discussions into the repo.

  Every discussion in the "Design history" category that has the `publish`
  label, and was written by a member of the organisation or a collaborator,
  becomes app/posts/discussions/<number>.md, published at
  /discussions/<number>/, with its images downloaded into
  app/images/discussions/<number>/. Files are named by discussion number so
  the title and date can change without changing the URL. Posts whose
  discussion has been deleted, unlabelled or moved out of the category are
  removed.

  The discussion is the source of truth: generated files are overwritten on
  every sync. Run by the deploy workflow (.github/workflows/deploy.yml), but
  can also be run locally:

  GITHUB_TOKEN=$(gh auth token) node scripts/sync-discussions.js

  Environment variables:
  - GITHUB_TOKEN (required): token that can read the repo's discussions
  - GITHUB_REPOSITORY: owner/name, defaults to digital-land/consumers-design-history
  - DISCUSSION_CATEGORY: category slug, defaults to design-history
  - PUBLISH_LABEL: label that publishes a post, defaults to publish
*/

import fs from 'node:fs/promises'
import path from 'node:path'

import {
  neutraliseMarkup,
  findImages,
  imageFilename,
  imageHash,
  isGithubImage,
  isPublishable,
  parseDate,
  parseFormBody,
  renderPost,
  rewriteImages
} from './lib/discussion-post.js'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export async function syncDiscussions ({
  discussions,
  rootDir,
  publishLabel = 'publish',
  download = downloadImage,
  log = console
}) {
  const postsDir = path.join(rootDir, 'app/posts/discussions')
  // Served from /discussions/<number>/, next to the post
  const imagesDir = path.join(rootDir, 'app/images/discussions')
  await fs.mkdir(postsDir, { recursive: true })

  const existing = await existingNumbers(postsDir)
  const published = discussions.filter(discussion => isPublishable(discussion, publishLabel))
  const keep = new Set(published.map(discussion => discussion.number))
  const changes = []
  const errors = []

  for (const discussion of published) {
    try {
      const { summary, date: dateField, tags, post } = parseFormBody(discussion.body)
      const date = parseDate(dateField) || discussion.createdAt.slice(0, 10)
      if (dateField && !parseDate(dateField)) {
        log.warn(`::warning::#${discussion.number} "${discussion.title}": date "${dateField}" isn't a valid date (use 2026-11-20 or 20/11/2026), so the date the discussion was created was used.`)
      }

      const postImagesDir = path.join(imagesDir, String(discussion.number))
      const localFiles = new Map()

      for (const image of findImages(post)) {
        if (!isGithubImage(image.src) || localFiles.has(image.src)) continue
        localFiles.set(image.src, await saveImage(image.src, postImagesDir, download))
        if (/^(image|screenshot\b)/i.test(image.alt.trim()) || !image.alt.trim()) {
          log.warn(`::warning::#${discussion.number} "${discussion.title}": image has no useful alt text ("${image.alt}"). Describe what it shows.`)
        }
      }

      await removeUnusedImages(postImagesDir, new Set(localFiles.values()))

      const contents = renderPost({
        discussion,
        summary,
        tags,
        date,
        post: neutraliseMarkup(rewriteImages(post, localFiles))
      })

      const file = path.join(postsDir, `${discussion.number}.md`)
      if (await readFile(file) !== contents) {
        await fs.writeFile(file, contents)
        changes.push(`${existing.has(discussion.number) ? 'Update' : 'Add'} #${discussion.number}: ${discussion.title}`)
      }
    } catch (error) {
      // Leave this post as it was, carry on with the others, and report it
      errors.push(`#${discussion.number} "${discussion.title}": ${error.message}`)
    }
  }

  for (const number of existing) {
    if (keep.has(number)) continue
    await fs.rm(path.join(postsDir, `${number}.md`), { force: true })
    await fs.rm(path.join(imagesDir, String(number)), { force: true, recursive: true })
    changes.push(`Remove #${number}`)
  }

  return { changes, errors }
}

export async function fetchDiscussions ({ token, owner, name, categorySlug, request = fetch }) {
  const graphql = async (query, variables) => {
    const response = await request('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        authorization: `bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    })
    const json = await response.json()
    if (!response.ok || json.errors) {
      throw new Error(`GitHub API error: ${JSON.stringify(json.errors || json)}`)
    }
    return json.data
  }

  const { repository } = await graphql(`
    query ($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        hasDiscussionsEnabled
        discussionCategories(first: 50) { nodes { id slug } }
      }
    }`, { owner, name })

  // Stop rather than remove every post if the category can't be found
  if (!repository.hasDiscussionsEnabled) {
    throw new Error(`Discussions are not enabled on ${owner}/${name}`)
  }
  const category = repository.discussionCategories.nodes.find(node => node.slug === categorySlug)
  if (!category) {
    throw new Error(`No discussion category with slug "${categorySlug}" on ${owner}/${name}`)
  }

  const discussions = []
  let cursor = null
  do {
    const data = await graphql(`
      query ($owner: String!, $name: String!, $categoryId: ID!, $cursor: String) {
        repository(owner: $owner, name: $name) {
          discussions(first: 50, after: $cursor, categoryId: $categoryId) {
            pageInfo { hasNextPage endCursor }
            nodes {
              number
              title
              body
              url
              createdAt
              lastEditedAt
              authorAssociation
              labels(first: 50) { nodes { name } }
            }
          }
        }
      }`, { owner, name, categoryId: category.id, cursor })
    const page = data.repository.discussions
    discussions.push(...page.nodes)
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (cursor)

  return discussions
}

async function downloadImage (url) {
  // Images in a public repo's discussions don't need authentication
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Could not download ${url}: ${response.status}`)
  const length = Number(response.headers.get('content-length'))
  if (length > MAX_IMAGE_BYTES) throw new Error(`Image ${url} is larger than 20MB`)
  const data = Buffer.from(await response.arrayBuffer())
  if (data.length > MAX_IMAGE_BYTES) throw new Error(`Image ${url} is larger than 20MB`)
  return { contentType: response.headers.get('content-type'), data }
}

async function saveImage (src, directory, download) {
  // Images are named by a hash of their URL, so an image already downloaded
  // for this post isn't downloaded again
  const existing = await fs.readdir(directory).catch(() => [])
  const known = existing.find(file => file.startsWith(`${imageHash(src)}.`))
  if (known) return known

  const { contentType, data } = await download(src)
  const filename = imageFilename(src, contentType)
  if (!filename) throw new Error(`Unsupported image type "${contentType}" for ${src}. Use PNG, JPEG, GIF, WebP or AVIF.`)

  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, filename), data)
  return filename
}

async function removeUnusedImages (directory, used) {
  const files = await fs.readdir(directory).catch(() => [])
  for (const file of files) {
    if (!used.has(file)) await fs.rm(path.join(directory, file), { force: true })
  }
  if (files.length && !used.size) await fs.rm(directory, { force: true, recursive: true })
}

// Discussion numbers of the posts already synced (files named <number>.md)
async function existingNumbers (postsDir) {
  const files = await fs.readdir(postsDir)
  return new Set(files
    .map(file => file.match(/^(\d+)\.md$/))
    .filter(Boolean)
    .map(match => Number(match[1])))
}

async function readFile (file) {
  return fs.readFile(file, 'utf8').catch(() => null)
}

async function main () {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.error('GITHUB_TOKEN is required, e.g. GITHUB_TOKEN=$(gh auth token) node scripts/sync-discussions.js')
    process.exit(1)
  }
  const [owner, name] = (process.env.GITHUB_REPOSITORY || 'digital-land/consumers-design-history').split('/')

  let discussions
  try {
    discussions = await fetchDiscussions({
      token,
      owner,
      name,
      categorySlug: process.env.DISCUSSION_CATEGORY || 'design-history'
    })
  } catch (error) {
    // Leave every post as it is, but don't block deploying other changes
    console.error(`::error::Could not fetch discussions, so no posts were synced: ${error.message}`)
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, 'errors=1\n')
    return
  }

  const { changes, errors } = await syncDiscussions({
    discussions,
    rootDir: process.cwd(),
    publishLabel: process.env.PUBLISH_LABEL || 'publish'
  })

  console.log(changes.length ? changes.join('\n') : 'No changes')
  for (const error of errors) console.error(`::error::${error}`)

  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `errors=${errors.length}\n`)
  }
  if (process.env.RUNNER_TEMP) {
    await fs.writeFile(
      path.join(process.env.RUNNER_TEMP, 'sync-commit-message'),
      `Sync design history posts from Discussions\n\n${changes.join('\n')}\n`
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`::error::${error.message}`)
    process.exit(1)
  })
}
