import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileReader from './FileReader.jsx'

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/pdf.worker.min.mjs',
}))

import * as pdfjs from 'pdfjs-dist'

const file = {
  name: 'Relatorio',
  extension: 'pdf',
  mimeType: 'application/pdf',
  providerName: 'Google Drive',
}

function failingDocument() {
  pdfjs.getDocument.mockReturnValue({
    promise: Promise.reject(new Error('expirado')),
    destroy: vi.fn(async () => {}),
  })
}

describe('FileReader erros', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('mostra erro e esconde o loader quando o PDF falha', async () => {
    failingDocument()
    render(
      <FileReader
        file={file}
        source={{ mode: 'pdf', url: '/doc.pdf' }}
        error={null}
        downloadUrl={null}
        onRetry={vi.fn()}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ler este PDF.')
    expect(screen.queryByRole('status', { name: 'Carregando arquivo' })).not.toBeInTheDocument()
  })

  it('oferece nova tentativa que remonta o leitor', async () => {
    const user = userEvent.setup()
    failingDocument()
    const onRetry = vi.fn()
    render(
      <FileReader
        file={file}
        source={{ mode: 'pdf', url: '/doc.pdf' }}
        error={null}
        downloadUrl={null}
        onRetry={onRetry}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('mostra erro no evento de falha da mídia', async () => {
    render(
      <FileReader
        file={{ ...file, extension: 'mp4', mimeType: 'video/mp4' }}
        source={{ mode: 'video', url: '/video.mp4' }}
        error={null}
        downloadUrl={null}
        onRetry={vi.fn()}
      />,
    )

    const video = document.querySelector('video')
    expect(video).toBeTruthy()
    fireEvent.error(video)

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar')
    expect(screen.queryByRole('status', { name: 'Carregando arquivo' })).not.toBeInTheDocument()
  })

  it('ignora cancelamento ao trocar de arquivo', async () => {
    let rejectFirst
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url === '/a.txt') {
          return new Promise((resolve, reject) => {
            rejectFirst = reject
          })
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode('novo').buffer,
        })
      }),
    )

    const view = render(
      <FileReader
        file={{ ...file, extension: 'txt' }}
        source={{ mode: 'text', url: '/a.txt' }}
        error={null}
        downloadUrl={null}
      />,
    )

    view.rerender(
      <FileReader
        file={{ ...file, extension: 'txt' }}
        source={{ mode: 'text', url: '/b.txt' }}
        error={null}
        downloadUrl={null}
      />,
    )

    rejectFirst(Object.assign(new Error('cancelado'), { name: 'AbortError' }))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(await screen.findByText('novo')).toBeInTheDocument()
  })
})
