import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, it } from 'node:test'

import { readFrontMatter } from '../../scripts/lib/discussion-post.js'
import { fetchDiscussions, repoRoleLookup, syncDiscussions } from '../../scripts/sync-discussions.js'

const asset = 'https://github.com/user-attachments/assets/aaaa-bbbb'

function body ({ date = '_No response_', post = `## Found\n\n<img alt="Search page" src="${asset}" />` } = {}) {
  return `### Summary\n\nSearch work\n\n### Date\n\n${date}\n\n### Tags\n\nsearch\n\n### Post\n\n${post}`
}

function discussion (overrides = {}) {
  return {
    number: 1,
    title: 'Designing search',
    url: 'https://github.com/o/r/discussions/1',
    createdAt: '2026-11-20T09:00:00Z',
    lastEditedAt: null,
    author: { login: 'designer' },
    labels: { nodes: [{ name: 'publish' }] },
    body: body(),
    ...overrides
  }
}

describe('syncDiscussions', () => {
  let rootDir
  let downloads
  let warnings
  let roleLookups

  // 'designer' can publish, 'outsider' only has read access to the public repo
  const roles = { designer: 'write', outsider: 'read' }
  const getRole = async login => {
    roleLookups++
    return roles[login] ?? null
  }
  const download = async () => {
    downloads++
    return { contentType: 'image/png', data: Buffer.from('png') }
  }
  const log = { warn: message => warnings.push(message) }
  const sync = discussions => syncDiscussions({ discussions, rootDir, getRole, download, log })
  const list = dir => fs.readdir(path.join(rootDir, dir)).catch(() => [])
  const readPost = async number => fs.readFile(path.join(rootDir, `app/posts/discussions/${number}.md`), 'utf8')

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-test-'))
    await fs.mkdir(path.join(rootDir, 'app/posts'), { recursive: true })
    downloads = 0
    warnings = []
    roleLookups = 0
  })

  it('writes a post named by discussion number, with its images next to it', async () => {
    const { changes, errors } = await sync([discussion()])
    assert.deepEqual(errors, [])
    assert.deepEqual(changes, ['Add #1: Designing search'])

    const post = await readPost(1)
    const [image] = await list('app/images/discussions/1')
    assert.match(image, /^[0-9a-f]{16}\.png$/)
    assert.match(post, new RegExp(`!\\[Search page\\]\\(${image}\\)`))
    assert.equal(readFrontMatter(post).date, '2026-11-20')
  })

  it('does nothing when nothing changed, and does not download again', async () => {
    await sync([discussion()])
    const { changes } = await sync([discussion()])
    assert.deepEqual(changes, [])
    assert.equal(downloads, 1)
  })

  it('keeps the same file when the title and date change', async () => {
    await sync([discussion()])
    const { changes } = await sync([discussion({ title: 'Renamed', body: body({ date: '01/10/2026' }) })])
    assert.deepEqual(changes, ['Update #1: Renamed'])
    assert.deepEqual(await list('app/posts/discussions'), ['1.md'])
    const data = readFrontMatter(await readPost(1))
    assert.equal(data.title, 'Renamed')
    assert.equal(data.date, '2026-10-01')
  })

  it('falls back to the created date, with a warning, when the date is invalid', async () => {
    await sync([discussion({ body: body({ date: 'next week' }) })])
    assert.equal(readFrontMatter(await readPost(1)).date, '2026-11-20')
    assert.match(warnings.join('\n'), /isn't a valid date/)
  })

  it('removes images that are no longer used', async () => {
    await sync([discussion()])
    await sync([discussion({ body: body({ post: 'No images now' }) })])
    assert.deepEqual(await list('app/images/discussions'), [])
  })

  it('removes a post when it is unlabelled or deleted', async () => {
    await sync([discussion()])
    const { changes } = await sync([discussion({ labels: { nodes: [] } })])
    assert.deepEqual(changes, ['Remove #1'])
    assert.deepEqual(await list('app/posts/discussions'), [])
    assert.deepEqual(await list('app/images/discussions'), [])
  })

  it('ignores posts from people without triage access, with a warning', async () => {
    const { changes } = await sync([
      discussion({ author: { login: 'outsider' } }),
      discussion({ number: 2, author: { login: 'stranger' } }),
      discussion({ number: 3, author: null })
    ])
    assert.deepEqual(changes, [])
    assert.equal(warnings.length, 3)
    assert.match(warnings[0], /written by outsider, who doesn't have triage access.*isn't published/)
  })

  describe('when the author leaves', () => {
    // 'leaver' had write access when they published, then lost it
    const leaver = { author: { login: 'leaver' } }

    beforeEach(async () => {
      roles.leaver = 'write'
      await sync([discussion(leaver)])
      roles.leaver = 'read'
      warnings = []
    })

    it('keeps their post published, unchanged', async () => {
      const before = await readPost(1)
      const { changes } = await sync([discussion(leaver)])
      assert.deepEqual(changes, [])
      assert.equal(await readPost(1), before)
      assert.match(warnings[0], /written by leaver.*published version was kept/)
    })

    it('ignores their later edits', async () => {
      const before = await readPost(1)
      const { changes } = await sync([discussion({ ...leaver, editor: { login: 'leaver' }, title: 'Changed by leaver' })])
      assert.deepEqual(changes, [])
      assert.equal(await readPost(1), before)
      assert.match(warnings[0], /last edited by leaver/)
    })

    it('publishes edits made by someone on the team', async () => {
      const { changes } = await sync([discussion({ ...leaver, editor: { login: 'designer' }, title: 'Fixed by designer' })])
      assert.deepEqual(changes, ['Update #1: Fixed by designer'])
    })

    it('keeps their post published if their account is deleted', async () => {
      const { changes } = await sync([discussion({ author: null })])
      assert.deepEqual(changes, [])
      assert.deepEqual(await list('app/posts/discussions'), ['1.md'])
      assert.match(warnings[0], /a deleted user/)
    })

    it('still removes their post if the label is removed', async () => {
      const { changes } = await sync([discussion({ ...leaver, labels: { nodes: [] } })])
      assert.deepEqual(changes, ['Remove #1'])
    })
  })

  it('does not publish an outsider\'s edit to a new post', async () => {
    const { changes } = await sync([discussion({ editor: { login: 'outsider' } })])
    assert.deepEqual(changes, [])
    assert.match(warnings[0], /last edited by outsider.*isn't published/)
  })

  it('does not look up the access of unlabelled posts, or the same author twice', async () => {
    await sync([
      discussion(),
      discussion({ number: 2 }),
      discussion({ number: 3, author: { login: 'outsider' }, labels: { nodes: [] } })
    ])
    assert.equal(roleLookups, 1)
  })

  it('keeps a published post when the access check fails', async () => {
    await sync([discussion()])
    const { errors } = await syncDiscussions({
      discussions: [discussion()],
      rootDir,
      getRole: async () => { throw new Error('API down') },
      download,
      log
    })
    assert.match(errors[0], /could not check the author's access: API down/)
    assert.deepEqual(await list('app/posts/discussions'), ['1.md'])
  })

  it('leaves a post as it was when an image fails, and syncs the rest', async () => {
    await sync([discussion()])
    const { errors } = await syncDiscussions({
      discussions: [
        discussion({ body: body({ post: `![New](${asset}-new)` }) }),
        discussion({ number: 2, title: 'Other', body: body({ post: 'Fine' }) })
      ],
      rootDir,
      getRole,
      download: async () => { throw new Error('404') },
      log
    })
    assert.equal(errors.length, 1)
    assert.match(await readPost(1), /Search page/)
    assert.deepEqual((await list('app/posts/discussions')).sort(), ['1.md', '2.md'])
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

describe('repoRoleLookup', () => {
  const respond = (status, json) => async () => ({ ok: status < 400, status, json: async () => json })
  const lookup = request => repoRoleLookup({ token: 't', owner: 'o', name: 'r', request })

  it('returns the role name', async () => {
    assert.equal(await lookup(respond(200, { permission: 'read', role_name: 'triage' }))('designer'), 'triage')
  })

  it('returns null for someone with no access', async () => {
    assert.equal(await lookup(respond(404, { message: 'Not Found' }))('stranger'), null)
  })

  it('throws on other errors', async () => {
    await assert.rejects(lookup(respond(500, { message: 'Server error' }))('designer'), /500/)
  })
})
