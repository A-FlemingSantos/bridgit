import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MediaReader from './MediaReader.jsx'

describe('media source renewal', () => {
  it('restores the playback position after a renewed source loads', () => {
    const ready = vi.fn()
    const { container, rerender } = render(<MediaReader mode="video" url="/first" title="Video" onReady={ready} />)
    const video = container.querySelector('video')
    fireEvent.loadedData(video)
    video.currentTime = 37
    fireEvent.timeUpdate(video)
    rerender(<MediaReader mode="video" url="/renewed" title="Video" onReady={ready} />)
    video.currentTime = 0
    fireEvent.timeUpdate(video)
    fireEvent.loadedData(video)
    expect(container.querySelector('video')).toBe(video)
    expect(video.currentTime).toBe(37)
  })
})
