import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HubOverlays from './HubOverlays.jsx'

const fixture = vi.hoisted(() => ({
  state: { overlay: null }, closeOverlay: vi.fn(), dispatch: vi.fn(),
  actions: { renameItem: vi.fn(), moveItem: vi.fn(), deleteItem: vi.fn() },
}))
vi.mock('./HubState.jsx', () => ({ useHub: () => fixture }))
vi.mock('../hub/index.js', () => ({
  useHubActions: () => fixture.actions,
  useProviders: () => ({ providers: [{ id: 'onedrive', name: 'OneDrive', connected: true }] }),
}))
vi.mock('../../features/spaces/components/LocationPicker/useLocationPicker.jsx', () => ({
  useLocationPicker: (options) => ({
    validated: true, refreshKey: 'fixture', trailing: null,
    body: <button onClick={() => options.onChoose({ kind: 'folder', ref: 'destination' })}>Escolher destino</button>,
  }),
}))

const item = { kind: 'file', ref: 'file-1', name: 'Example.jpg', providerId: 'onedrive' }
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
  })

  it('shows a rejected delete and restores the cancel and retry controls', async () => {
    const user = userEvent.setup()
    show({ type: 'confirm-delete-entry' })
    await user.click(screen.getByRole('button', { name: 'Excluir', exact: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo foi alterado.')
    expect(screen.getByRole('button', { name: 'Excluir', exact: true })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancelar', exact: true })).toBeEnabled()
  })
})
