import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HubOverlays from './HubOverlays.jsx'

const fixture = vi.hoisted(() => ({
  state: { overlay: null }, closeOverlay: vi.fn(), dispatch: vi.fn(),
  actions: { renameItem: vi.fn(), moveItem: vi.fn(), deleteItem: vi.fn(), createFolder: vi.fn() },
  connections: [{ connectionId: 'conn-1', provider: 'onedrive', providerName: 'OneDrive' }],
}))
vi.mock('./HubState.jsx', () => ({ useHub: () => fixture }))
vi.mock('../hub/index.js', () => ({
  useHubActions: () => fixture.actions,
  useConnections: () => ({ connections: fixture.connections }),
}))
vi.mock('../../features/spaces/components/LocationPicker/useLocationPicker.jsx', () => ({
  useLocationPicker: (options) => ({
    validated: true, refreshKey: 'fixture', trailing: null,
    body: <button onClick={() => options.onChoose({ kind: 'folder', ref: 'destination' })}>Escolher destino</button>,
  }),
}))

const item = { kind: 'file', ref: 'file-1', name: 'Example.jpg', connectionId: 'conn-1' }
function show(overlay) {
  fixture.state.overlay = { ...item, ...overlay }
  return render(<StrictMode><HubOverlays /></StrictMode>)
}

describe('operation errors in StrictMode overlays', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(fixture.actions).forEach((action) => action.mockRejectedValue(new Error('O arquivo foi alterado. Atualize antes de tentar novamente.')))
  })

  it('shows a rejected rename and enables another attempt', async () => {
    const user = userEvent.setup()
    show({ type: 'name', mode: 'rename' })
    await user.click(screen.getByRole('button', { name: 'Salvar', exact: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo foi alterado.')
    expect(screen.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: 'Nome do arquivo' })).toBeEnabled()
    expect(fixture.closeOverlay).not.toHaveBeenCalled()
  })

  it('shows a rejected move and permits choosing the destination again', async () => {
    const user = userEvent.setup()
    show({ type: 'move' })
    await user.click(screen.getByRole('button', { name: 'Escolher destino' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo foi alterado.')
    await user.click(screen.getByRole('button', { name: 'Escolher destino' }))
    expect(fixture.actions.moveItem).toHaveBeenCalledTimes(2)
    expect(fixture.actions.moveItem).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'conn-1', ref: 'file-1' }))
  })

  it('shows a rejected delete and restores the cancel and retry controls', async () => {
    const user = userEvent.setup()
    show({ type: 'confirm-delete-entry' })
    await user.click(screen.getByRole('button', { name: 'Excluir', exact: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo foi alterado.')
    expect(screen.getByRole('button', { name: 'Excluir', exact: true })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancelar', exact: true })).toBeEnabled()
  })

  it('explica que a exclusão envia o arquivo para a lixeira do provedor', () => {
    show({ type: 'confirm-delete-entry' })
    expect(screen.getByText('"Example.jpg" vai para a lixeira do provedor.')).toBeInTheDocument()
  })

  it('explica que a exclusão envia a pasta e o conteúdo para a lixeira do provedor', () => {
    show({ type: 'confirm-delete-entry', kind: 'folder', name: 'Relatórios' })
    expect(screen.getByText('"Relatórios" e tudo o que está dentro dela vão para a lixeira do provedor.')).toBeInTheDocument()
  })
})

describe('onde criar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fixture.actions.createFolder.mockResolvedValue({})
    fixture.connections = [
      { connectionId: 'conn-1', provider: 'onedrive', providerName: 'OneDrive', account: { email: 'ana@mail.com' } },
      { connectionId: 'conn-2', provider: 'onedrive', providerName: 'OneDrive', account: { email: 'bia@mail.com' } },
      { connectionId: 'conn-3', provider: 'dropbox', providerName: 'Dropbox', account: { email: 'ana@mail.com' } },
    ]
  })

  it('lista cada conta, com o e-mail quando o provedor tem mais de uma', async () => {
    fixture.state.overlay = { type: 'name', kind: 'folder' }
    render(<HubOverlays />)

    expect(screen.getByRole('option', { name: 'OneDrive ana@mail.com' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'OneDrive bia@mail.com' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Dropbox' })).toBeInTheDocument()
  })

  it('cria na conta escolhida, não no provedor', async () => {
    const user = userEvent.setup()
    fixture.state.overlay = { type: 'name', kind: 'folder' }
    render(<HubOverlays />)

    await user.click(screen.getByRole('option', { name: 'OneDrive bia@mail.com' }))
    await user.click(screen.getByRole('button', { name: 'Criar' }))

    expect(fixture.actions.createFolder).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'conn-2', parentRef: null }))
  })
})
