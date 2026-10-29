import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { describe, expect, it } from 'vitest'
import { frontMatter } from './frontMatter.js'

const parser = markdown({ base: markdownLanguage, extensions: [frontMatter] }).language.parser

function names(doc) {
  const found = []
  parser.parse(doc).iterate({ enter: (node) => void found.push(node.name) })
  return found
}

function nodes(doc, name) {
  const found = []
  parser.parse(doc).iterate({
    enter: (node) => {
      if (node.name === name) found.push([node.from, node.to])
    },
  })
  return found
}

describe('frontMatter', () => {
  it('parses a closed block at line 1 into FrontMatter with marks on the delimiters', () => {
    const doc = '---\ntitle: Oi\ntags: [a]\n---\n\n# Titulo\n'
    expect(nodes(doc, 'FrontMatter')).toEqual([[0, 27]])
    expect(nodes(doc, 'FrontMatterMark')).toEqual([
      [0, 3],
      [24, 27],
    ])
    const all = names(doc)
    expect(all).not.toContain('SetextHeading2')
    expect(all).not.toContain('HorizontalRule')
    expect(all).toContain('ATXHeading1')
  })

  it('accepts ... as the closing line', () => {
    expect(nodes('---\na: 1\n...\ntext', 'FrontMatter')).toEqual([[0, 12]])
  })

  it('does not treat an unclosed top --- as front matter', () => {
    const all = names('---\ntitle: Oi\n\ntexto\n')
    expect(all).not.toContain('FrontMatter')
    expect(all).toContain('HorizontalRule')
  })

  it('keeps --- below line 1 as a rule', () => {
    const all = names('texto\n\n---\n\noutro\n---\n')
    expect(all).not.toContain('FrontMatter')
    expect(all).toContain('HorizontalRule')
    expect(names('\n---\na: 1\n---\n')).not.toContain('FrontMatter')
  })

  it('ignores a --- opener inside a container', () => {
    expect(names('> ---\n> a\n> ---\n')).not.toContain('FrontMatter')
  })
})
