import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, it } from 'node:test'

import { fetchDiscussions, syncDiscussions } from '../../scripts/sync-discussions.js'

const asset = 'https://github.com/user-attachments/assets/aaaa-bbbb'

function discussion (overrides = {}) {
  return {
    number: 1,
    title: 'Designing search',
    url: 'https://github.com/o/r/discussions/1',
    createdAt: '2026-11-20T09:00:00Z',
    lastEditedAt: null,
    authorAssociation: 'MEMBER',
    labels: { nodes: [{ name: 'publish' }] },
    body: `### Summary\n\nSearch work\n\n### Tags\n\nsearch\n\n### Post\n\n## Found\n\n<img alt="Search page" src="${asset}" />`,
    ...overrides
  }
}

const silent = { warn: () => {} }

describe('syncDiscussions', () => {
  let rootDir
  let downloads

  const download = async () => {
    downloads++
    return { contentType: 'image/png', data: Buffer.from('png') }
  }
  const sync = discussions => syncDiscussions({ discussions, rootDir, download, log: silent })
  const postsDir = () => path.join(rootDir, 'app/posts/discussions')
  const list = dir => fs.readdir(path.join(rootDir, dir)).catch(() => [])

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-test-'))
    await fs.mkdir(path.join(rootDir, 'app/posts'), { recursive: true })
    downloads = 0
  })

  it('writes a post and downloads its images next to it', async () => {
    const { changes, errors } = await sync([discussion()])
    assert.deepEqual(errors, [])
    assert.deepEqual(changes, ['Add #1: Designing search'])

    const post = await fs.readFile(path.join(postsDir(), '2026-11-20-designing-search.md'), 'utf8')
    const [image] = await list('app/images/designing-search')
    assert.match(image, /^[0-9a-f]{16}\.png$/)
    assert.match(post, new RegExp(`!\\[Search page\\]\\(${image}\\)`))
  })

  it('does nothing when nothing changed, and does not download again', async () => {
    await sync([discussion()])
    const { changes } = await sync([discussion()])
    assert.deepEqual(changes, [])
    assert.equal(downloads, 1)
  })

  it('keeps the same URL when the title changes', async () => {
    await sync([discussion()])
    const { changes } = await sync([discussion({ title: 'Renamed' })])
    assert.deepEqual(changes, ['Update #1: Renamed'])
    assert.deepEqual(await list('app/posts/discussions'), ['2026-11-20-designing-search.md'])
  })

  it('removes images that are no longer used', async () => {
    await sync([discussion()])
    await sync([discussion({ body: 'No images now' })])
    assert.deepEqual(await list('app/images/designing-search'), [])
  })

  it('removes a post when it is unlabelled or deleted', async () => {
    await sync([discussion()])
    const { changes } = await sync([discussion({ labels: { nodes: [] } })])
    assert.deepEqual(changes, ['Remove #1: 2026-11-20-designing-search'])
    assert.deepEqual(await list('app/posts/discussions'), [])
    assert.deepEqual(await list('app/images'), [])
  })

  it('ignores posts from people outside the team', async () => {
    const { changes } = await sync([discussion({ authorAssociation: 'NONE' })])
    assert.deepEqual(changes, [])
  })

  it('does not clash with an existing post', async () => {
    await fs.writeFile(path.join(rootDir, 'app/posts/2026-11-20-designing-search.md'), '')
    await sync([discussion()])
    assert.deepEqual(await list('app/posts/discussions'), ['2026-11-20-designing-search-2.md'])
  })

  it('leaves a post as it was when an image fails, and syncs the rest', async () => {
    await sync([discussion()])
    const failing = async () => { throw new Error('404') }
    const { errors } = await syncDiscussions({
      discussions: [
        discussion({ body: `![New](${asset}-new)` }),
        discussion({ number: 2, title: 'Other', body: 'Fine' })
      ],
      rootDir,
      download: failing,
      log: silent
    })
    assert.equal(errors.length, 1)
    const post = await fs.readFile(path.join(postsDir(), '2026-11-20-designing-search.md'), 'utf8')
    assert.match(post, /Search page/)
    assert.deepEqual((await list('app/posts/discussions')).sort(), ['2026-11-20-designing-search.md', '2026-11-20-other.md'])
  })
})

describe('fetchDiscussions', () => {
  const respond = data => async () => ({ ok: true, json: async () => ({ data }) })

  it('stops if the category does not exist, rather than removing every post', async () => {
    const request = respond({ repository: { hasDiscussionsEnabled: true, discussionCategories: { nodes: [] } } })
    await assert.rejects(
      fetchDiscussions({ token: 't', owner: 'o', name: 'r', categorySlug: 'design-history', request }),
      /No discussion category/
    )
  })

  it('stops if discussions are not enabled', async () => {
    const request = respond({ repository: { hasDiscussionsEnabled: false, discussionCategories: { nodes: [] } } })
    await assert.rejects(
      fetchDiscussions({ token: 't', owner: 'o', name: 'r', categorySlug: 'design-history', request }),
      /not enabled/
    )
  })
})
