import { describe, expect, it } from 'vitest'
import { inheritGradients } from './svgMarkup'
import { edge } from '../assets/browserMarks'

describe('inheritGradients', () => {
  it('copies units, transform and stops from the referenced gradient', () => {
    const xml = '<svg><linearGradient id="a" gradientUnits="userSpaceOnUse"><stop offset="0"/></linearGradient>'
      + '<radialGradient id="b" cx="5" xlink:href="#a" gradientTransform="scale(2)"/></svg>'
    const out = inheritGradients(xml)
    expect(out).toContain('<radialGradient id="b" cx="5" gradientTransform="scale(2)" gradientUnits="userSpaceOnUse"><stop offset="0"/></radialGradient>')
    expect(out).not.toContain('href')
  })

  it("keeps a gradient's own stops and transform", () => {
    const xml = '<linearGradient id="a" gradientUnits="userSpaceOnUse" gradientTransform="x"/>'
      + '<linearGradient id="b" href="#a" gradientTransform="y"><stop offset="1"/></linearGradient>'
    const out = inheritGradients(xml)
    expect(out).toContain('<linearGradient id="b" gradientTransform="y" gradientUnits="userSpaceOnUse"><stop offset="1"/></linearGradient>')
  })

  it('resolves every gradient of the Edge mark to user space', () => {
    const out = inheritGradients(edge)
    const gradients = out.match(/<(linear|radial)Gradient\b[^>]*>/g)
    expect(gradients).toHaveLength(7)
    expect(gradients.filter((tag) => !tag.includes('gradientUnits="userSpaceOnUse"'))).toEqual([])
    expect(out).not.toMatch(/Gradient[^>]*href=/)
  })
})
