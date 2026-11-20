import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  neutraliseMarkup,
  findImages,
  hasPublishLabel,
  isTrustedRole,
  parseDate,
  parseFormBody,
  readFrontMatter,
  renderPost,
  rewriteImages
} from '../../scripts/lib/discussion-post.js'

const formBody = [
  '### Summary',
  '',
  'We redesigned the search page.',
  '',
  '### Date',
  '',
  '01/10/2026',
  '',
  '### Tags',
  '',
  'search, user research ',
  '',
  '### Post',
  '',
  '## What we found',
  '',
  '### Summary',
  '',
  'A heading the designer wrote, which is part of the post.'
].join('\r\n')

describe('parseFormBody', () => {
  it('splits a discussion form into summary, date, tags and post', () => {
    const result = parseFormBody(formBody)
    assert.equal(result.summary, 'We redesigned the search page.')
    assert.equal(result.date, '01/10/2026')
    assert.deepEqual(result.tags, ['search', 'user research'])
    assert.equal(result.post, '## What we found\n\n### Summary\n\nA heading the designer wrote, which is part of the post.')
  })

  it('treats empty optional fields as empty', () => {
    const result = parseFormBody('### Summary\n\nHi\n\n### Date\n\n_No response_\n\n### Tags\n\n_No response_\n\n### Post\n\nBody')
    assert.equal(result.date, '')
    assert.deepEqual(result.tags, [])
  })

  it('copes with fields missing, e.g. from before the date field was added', () => {
    const result = parseFormBody('### Summary\n\nHi\n\n### Tags\n\nsearch\n\n### Post\n\nBody')
    assert.equal(result.summary, 'Hi')
    assert.equal(result.date, '')
    assert.deepEqual(result.tags, ['search'])
    assert.equal(result.post, 'Body')
  })

  it('uses the whole body as the post when the form was not used', () => {
    const result = parseFormBody('## Heading\n\nFirst **paragraph** here.\n\nMore.')
    assert.equal(result.summary, 'First paragraph here.')
    assert.equal(result.post, '## Heading\n\nFirst **paragraph** here.\n\nMore.')
  })
})

describe('who can publish', () => {
  const discussion = labels => ({ labels: { nodes: labels.map(name => ({ name })) } })

  it('needs the publish label', () => {
    assert.equal(hasPublishLabel(discussion(['idea', 'publish']), 'publish'), true)
    assert.equal(hasPublishLabel(discussion(['idea']), 'publish'), false)
    assert.equal(hasPublishLabel({}, 'publish'), false)
  })

  it('needs triage access or above', () => {
    for (const role of ['admin', 'maintain', 'write', 'triage']) assert.equal(isTrustedRole(role), true)
    for (const role of ['read', null, undefined]) assert.equal(isTrustedRole(role), false)
  })
})

describe('images', () => {
  const asset = 'https://github.com/user-attachments/assets/1111-2222'
  const markdown = [
    `<img width="800" alt="Old search page" src="${asset}" />`,
    '![External](https://example.com/a.png "title")'
  ].join('\n\n')

  it('finds markdown images and drag-and-drop img tags', () => {
    assert.deepEqual(findImages(markdown).map(({ alt, src }) => ({ alt, src })), [
      { alt: 'Old search page', src: asset },
      { alt: 'External', src: 'https://example.com/a.png' }
    ])
  })

  it('points downloaded images at the local copy', () => {
    const result = rewriteImages(markdown, new Map([[asset, 'abc.png']]))
    assert.equal(result, '![Old search page](abc.png)\n\n![External](https://example.com/a.png)')
  })
})

describe('neutraliseMarkup', () => {
  it('escapes HTML tags but leaves code alone', () => {
    const input = [
      'Text <script>alert(1)</script> and `<b>code</b>`',
      '```html',
      '<div>example</div>',
      '```',
      'a < b'
    ].join('\n')
    assert.equal(neutraliseMarkup(input), [
      'Text &lt;script>alert(1)&lt;/script> and `<b>code</b>`',
      '```html',
      '<div>example</div>',
      '```',
      'a < b'
    ].join('\n'))
  })

  it('escapes markdown-it-attrs syntax, which could add event handlers', () => {
    assert.equal(
      neutraliseMarkup('Para {onclick="alert(1)"} and \\{.x} but `{code}`'),
      'Para &#123;onclick="alert(1)"} and \\&#123;.x} but `{code}`'
    )
  })
})

describe('parseDate', () => {
  it('accepts ISO and UK dates', () => {
    assert.equal(parseDate('2026-11-20'), '2026-11-20')
    assert.equal(parseDate('20/11/2026'), '2026-11-20')
    assert.equal(parseDate('1/2/2026'), '2026-02-01')
  })

  it('rejects empty, unknown and impossible dates', () => {
    assert.equal(parseDate(''), null)
    assert.equal(parseDate('next Tuesday'), null)
    assert.equal(parseDate('31/02/2026'), null)
    assert.equal(parseDate('11/20/2026'), null)
  })
})

describe('renderPost', () => {
  it('writes front matter that cannot be broken by the title', () => {
    const contents = renderPost({
      discussion: {
        number: 7,
        url: 'https://github.com/o/r/discussions/7',
        title: 'Search: "v2"\nnew line <b>',
        lastEditedAt: '2026-11-21T10:00:00Z'
      },
      summary: 'Summary',
      tags: ['search'],
      date: '2026-11-20',
      post: '{{ notNunjucks }}'
    })
    const data = readFrontMatter(contents)
    assert.equal(data.title, 'Search: "v2" new line')
    assert.equal(data.date, '2026-11-20')
    assert.equal(data.modified, '2026-11-21')
    assert.equal(data.templateEngineOverride, 'md')
    assert.deepEqual(data.discussion, { number: 7, url: 'https://github.com/o/r/discussions/7' })
    assert.match(contents, /\{\{ notNunjucks \}\}/)
  })
})
