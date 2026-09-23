import { render, screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '@bridgit/shared-client'
import App from './App.jsx'
import { clearBrowserCookies } from './test/setup.js'

vi.mock('@bridgit/shared-client', () => ({
  apiRequest: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    constructor(message, options = {}) {
      super(message)
      this.name = 'ApiClientError'
      this.status = options.status ?? 500
      this.code = options.code
      this.validations = options.validations ?? null
    }
  },
}))

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

const testSessionResponse = {
  accessToken: 'test-token',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  user: { id: 'user-1', username: 'arthur' },
  session: { id: 'session-1', persistent: true },
}

function seedAuthenticatedSession(overrides = {}) {
  localStorage.setItem(
    'bridgit.session',
    JSON.stringify({
      accessToken: 'test-token',
      expiresAt: testSessionResponse.expiresAt,
      user: { id: 'user-1', username: 'arthur' },
      session: { id: 'session-1', persistent: true },
      ...overrides,
    }),
  )
}

function setupAuthenticatedApi() {
  seedAuthenticatedSession()
  apiRequest.mockImplementation(async (path) => {
    if (path === '/api/auth/refresh') {
      return testSessionResponse
    }
    throw new Error(`Unexpected apiRequest path: ${path}`)
  })
}

beforeEach(() => {
  clearBrowserCookies()
  localStorage.clear()
  sessionStorage.clear()
  apiRequest.mockReset()
})

describe('App', () => {
  it('mostra a landing na raiz', async () => {
    render(
      <MemoryRouter {...router} initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /Toda a nuvem,\s*num só lugar/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
    expect(screen.getAllByRole('link', { name: 'Criar conta' })[0]).toHaveAttribute('href', '/register')
  })

  it('mostra o login em duas colunas', async () => {
    render(
      <MemoryRouter {...router} initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/register')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('mostra os provedores na home', async () => {
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: 'Início' })).toHaveAttribute('href', '/home')
    expect(screen.getByRole('link', { name: 'Spaces' })).toHaveAttribute('href', '/spaces')
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Atalhos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recentes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'OneDrive Conectado' })).toHaveAttribute('href', '/providers/onedrive')
    expect(screen.getByRole('link', { name: 'Google Drive Conectado' })).toHaveAttribute('href', '/providers/google-drive')
    expect(screen.getAllByRole('link', { name: 'Análise de desempenho' })[0]).toHaveAttribute(
      'href',
      '/providers/onedrive/file/c4d8b207-5a1e-49f3-8e6c-9b0d2f7a13e8',
    )
    expect(screen.queryByRole('link', { name: /Trabalho/ })).not.toBeInTheDocument()
  })

  it('abre o menu de Enviar com os provedores', async () => {
    const user = userEvent.setup()
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Enviar' }))
    expect(screen.getByRole('menuitem', { name: 'OneDrive' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Google Drive' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Dropbox' })).toBeInTheDocument()
  })

  it('mostra os spaces e abre o par de sinc', async () => {
    const user = userEvent.setup()
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/spaces']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Spaces' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Spaces' })).toHaveAttribute('href', '/spaces')
    expect(screen.getByRole('link', { name: 'Scripts' })).toHaveAttribute('href', '/s/scripts')
    expect(screen.getByRole('link', { name: 'Currículo' })).toHaveAttribute('href', '/s/curriculo')
    expect(screen.getByRole('button', { name: 'Novo space' })).toBeInTheDocument()
    expect(screen.getByText('OneDrive ↔ Dropbox')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Scripts' }))

    expect(screen.getByRole('textbox', { name: 'Nome do space' })).toHaveValue('Scripts')
    expect(screen.getByText('Origem')).toBeInTheDocument()
    expect(screen.getByText('Destino')).toBeInTheDocument()
    expect(screen.getByText('OneDrive')).toBeInTheDocument()
    expect(screen.getByText('Dropbox')).toBeInTheDocument()
    const actions = screen.getByRole('complementary', { name: 'Ações' })
    expect(within(actions).getByRole('button', { name: 'Sincronizar' })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: 'Excluir space' })).toBeInTheDocument()
    expect(within(actions).getByRole('status')).toHaveTextContent('Sincronizado')
    expect(
      within(screen.getByRole('region', { name: 'Par de sincronização' })).queryByRole('status'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar' })).not.toBeInTheDocument()
    expect(document.querySelector('.theme-dark')).toBeTruthy()
  })

  it('cria um space só depois de escolher as duas pastas', async () => {
    const user = userEvent.setup()
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/spaces']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Novo space' }))

    expect(screen.getByRole('dialog', { name: 'Novo space' })).toBeInTheDocument()
    const originTabs = screen.getByRole('tablist', { name: 'Provedor de origem' })
    const destTabs = screen.getByRole('tablist', { name: 'Provedor de destino' })
    expect(within(originTabs).getByRole('tab', { name: 'OneDrive' })).toBeInTheDocument()
    expect(within(originTabs).getByRole('tab', { name: 'Google Drive' })).toBeInTheDocument()
    expect(within(originTabs).getByRole('tab', { name: 'Dropbox' })).toBeInTheDocument()
    expect(within(destTabs).getByRole('tab', { name: 'OneDrive' })).toBeInTheDocument()
    expect(within(destTabs).getByRole('tab', { name: 'Google Drive' })).toBeInTheDocument()
    expect(within(destTabs).getByRole('tab', { name: 'Dropbox' })).toBeInTheDocument()
    const create = screen.getByRole('button', { name: 'Criar' })
    expect(create).toBeDisabled()
    await user.type(screen.getByLabelText('Nome'), 'Arquivo morto')
    expect(create).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Escolher pasta de Origem' }))
    await user.click(screen.getByRole('button', { name: /Inovações técnicas/ }))
    await user.click(screen.getByRole('button', { name: 'Escolher' }))

    await user.click(screen.getByRole('button', { name: 'Escolher pasta de Destino' }))
    await user.click(screen.getByRole('button', { name: /Acervo digital/ }))
    await user.click(screen.getByRole('button', { name: 'Escolher' }))

    expect(screen.getByRole('button', { name: 'Criar' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Criar' }))

    expect(screen.getByRole('textbox', { name: 'Nome do space' })).toHaveValue('Arquivo morto')
    expect(screen.getByText('Origem')).toBeInTheDocument()
    expect(screen.getByText('Destino')).toBeInTheDocument()
  })

  it('permite origens no mesmo provedor em pastas diferentes', async () => {
    const user = userEvent.setup()
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/spaces']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Novo space' }))
    await user.type(screen.getByLabelText('Nome'), 'Espelho OneDrive')

    await user.click(screen.getByRole('button', { name: 'Escolher pasta de Origem' }))
    await user.click(screen.getByRole('button', { name: /Inovações técnicas/ }))
    await user.click(screen.getByRole('button', { name: 'Escolher' }))

    await user.click(
      within(screen.getByRole('tablist', { name: 'Provedor de destino' })).getByRole('tab', {
        name: 'OneDrive',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Escolher pasta de Destino' }))
    await user.click(screen.getByRole('button', { name: /Referências de código/ }))
    await user.click(screen.getByRole('button', { name: 'Escolher' }))

    expect(screen.getByRole('button', { name: 'Criar' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Criar' }))
    expect(screen.getByRole('textbox', { name: 'Nome do space' })).toHaveValue('Espelho OneDrive')
  })

  it('mostra pastas e arquivos no seletor de space', async () => {
    const user = userEvent.setup()
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/spaces']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Novo space' }))
    await user.click(screen.getByRole('button', { name: 'Escolher pasta de Origem' }))

    expect(screen.getByRole('button', { name: /Inovações técnicas/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Referências de código/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Relatório 2023/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Análise de desempenho/ })).toBeInTheDocument()
  })

  it('mostra a cadeia de pastas no seletor de space', async () => {
    const user = userEvent.setup()
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/spaces']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Novo space' }))
    await user.click(screen.getByRole('button', { name: 'Escolher pasta de Origem' }))
    await user.click(screen.getByRole('button', { name: /Inovações técnicas/ }))
    await user.click(screen.getByRole('button', { name: /Relatórios/ }))

    const nav = screen.getByRole('navigation', { name: 'Localização atual' })
    expect(within(nav).getByRole('button', { name: 'OneDrive' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Inovações técnicas' })).toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: 'Relatórios' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Relatórios' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rascunho/ })).toBeInTheDocument()
  })

  it('mostra as ações de um arquivo no provedor', async () => {
    const user = userEvent.setup()
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/providers/onedrive']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Ações de Relatório 2023' }))
    expect(screen.getByRole('menuitem', { name: 'Renomear' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Mover' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Espelhar' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Link público' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Remover atalho' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toBeInTheDocument()
  })

  it('renomeia um arquivo pelo menu', async () => {
    const user = userEvent.setup()
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/providers/onedrive']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Ações de Relatório 2023' }))
    await user.click(screen.getByRole('menuitem', { name: 'Renomear' }))
    const dialog = screen.getByRole('dialog', { name: 'Renomear' })
    const input = within(dialog).getByLabelText('Nome do arquivo')
    await user.clear(input)
    await user.type(input, 'Relatório final')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('link', { name: /Relatório final/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Relatório 2023/ })).not.toBeInTheDocument()
  })

  it('move um arquivo para outra pasta', async () => {
    const user = userEvent.setup()
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/providers/onedrive']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Ações de Relatório 2023' }))
    await user.click(screen.getByRole('menuitem', { name: 'Mover' }))
    const dialog = screen.getByRole('dialog', { name: 'Mover' })
    await user.click(within(dialog).getByRole('button', { name: /Referências de código/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Escolher' }))

    expect(screen.queryByRole('dialog', { name: 'Mover' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Relatório 2023/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /Referências de código/ }))
    expect(screen.getByRole('link', { name: /Relatório 2023/ })).toBeInTheDocument()
  })

  it('mostra as ações de uma pasta e exclui pelo overlay', async () => {
    const user = userEvent.setup()
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/providers/onedrive']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Ações de Inovações técnicas' }))
    expect(screen.getByRole('menuitem', { name: 'Renomear' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Mover' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Espelhar' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }))
    const dialog = screen.getByRole('dialog', { name: 'Excluir pasta' })
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))
    expect(screen.queryByRole('link', { name: /Inovações técnicas/ })).not.toBeInTheDocument()
  })

  it('mostra conflitos no space', async () => {
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/s/curriculo']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('textbox', { name: 'Nome do space' })).toHaveValue('Currículo')
    expect(
      within(screen.getByRole('complementary', { name: 'Ações' })).getByRole('status'),
    ).toHaveTextContent('Conflito')
    expect(
      within(screen.getByRole('region', { name: 'Par de sincronização' })).queryByRole('status'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Currículo.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manter origem' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manter destino' })).toBeInTheDocument()
  })

  it('mostra as pastas ancestrais de um arquivo aninhado', async () => {
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/providers/onedrive/file/f2b8d4c1-7e50-4a91-8c36-1d9e5a0b7f24']}>
        <App />
      </MemoryRouter>,
    )

    const nav = await screen.findByRole('navigation', { name: 'Localização atual' })
    expect(within(nav).getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/home')
    expect(within(nav).getByRole('link', { name: 'OneDrive' })).toHaveAttribute('href', '/providers/onedrive')
    expect(within(nav).getByRole('link', { name: 'Inovações técnicas' })).toHaveAttribute(
      'href',
      '/providers/onedrive/folder/4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334',
    )
    expect(within(nav).getByRole('link', { name: 'Relatórios' })).toHaveAttribute(
      'href',
      '/providers/onedrive/folder/e3c7a1b4-6d29-4f80-9e15-2a8c4b70d193',
    )
    expect(screen.getAllByRole('heading', { name: 'Rascunho' }).length).toBeGreaterThan(0)
  })

  it('mostra a lista de um provedor', async () => {
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/providers/onedrive']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'OneDrive' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Localização atual' })).getByRole('link', { name: 'Início' }),
    ).toHaveAttribute('href', '/home')
    expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Inovações técnicas/ })).toHaveAttribute(
      'href',
      '/providers/onedrive/folder/4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334',
    )
    expect(screen.getByRole('link', { name: /Relatório 2023/ })).toHaveAttribute(
      'href',
      '/providers/onedrive/file/a1c9e4d2-8f70-4b31-9c05-2d6e8a14b7f0',
    )
  })

  it('mostra a aba de conta nas configurações', async () => {
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    )

    const dialog = await screen.findByRole('dialog', { name: 'Configurações' })
    expect(screen.getByRole('heading', { name: 'Conta' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Conta' })).toHaveAttribute('href', '/settings')
    expect(within(dialog).getByRole('link', { name: 'Provedores' })).toHaveAttribute('href', '/settings/providers')
    expect(within(dialog).getByRole('link', { name: 'Sincronização' })).toHaveAttribute('href', '/settings/sync')
    expect(within(dialog).getByRole('link', { name: 'Segurança' })).toHaveAttribute('href', '/settings/security')
    expect(within(dialog).getByRole('link', { name: 'Sobre' })).toHaveAttribute('href', '/settings/about')
    expect(within(dialog).getByLabelText('Usuário')).toHaveValue('arthur')
    expect(within(dialog).getByRole('button', { name: 'Sair' })).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Senha atual')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('OneDrive')).not.toBeInTheDocument()
  })

  it('mostra os provedores na aba correspondente', async () => {
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/settings/providers']}>
        <App />
      </MemoryRouter>,
    )

    const dialog = await screen.findByRole('dialog', { name: 'Configurações' })
    expect(within(dialog).getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
    expect(within(dialog).getByText('arthur@outlook.com')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('button', { name: 'Desconectar' })).toHaveLength(2)
    expect(within(dialog).getByRole('button', { name: 'Conectar' })).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Usuário')).not.toBeInTheDocument()
  })

  it('mostra os spaces na sincronização', async () => {
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/settings/sync']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Sincronização' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Avisar se a sincronização falhar' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('link', { name: 'Scripts' })).toHaveAttribute('href', '/s/scripts')
    expect(screen.getByRole('switch', { name: 'Pausar Scripts' })).toHaveAttribute('aria-checked', 'true')
  })

  it('mostra senha e sessão na aba de segurança', async () => {
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/settings/security']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('Senha atual')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar senha' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encerrar outras sessões' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excluir conta' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Manter este dispositivo' })).toBeInTheDocument()
  })

  it('abre configurações sobre a página anterior e fecha no painel', async () => {
    const user = userEvent.setup()
    setupAuthenticatedApi()
    render(
      <MemoryRouter {...router} initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('link', { name: 'Configurações' }))

    const dialog = screen.getByRole('dialog', { name: 'Configurações' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Conta' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Fechar configurações' }))

    await waitForElementToBeRemoved(() => screen.queryByRole('dialog', { name: 'Configurações' }))
    expect(screen.getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
  })

  it('mostra o cadastro na mesma tela', async () => {
    render(
      <MemoryRouter {...router} initialEntries={['/register']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Cadastro' })).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar senha')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeInTheDocument()
  })

  it('nao navega no login antes da resposta', async () => {
    let resolveLogin
    apiRequest.mockImplementation((path) => {
      if (path === '/api/auth/login') {
        return new Promise((resolve) => {
          resolveLogin = () => resolve(testSessionResponse)
        })
      }
      return Promise.reject(new Error(`Unexpected apiRequest path: ${path}`))
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter {...router} initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Entrar' })
    await user.type(screen.getByLabelText('Usuário'), 'arthur')
    await user.type(screen.getByLabelText('Senha'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    resolveLogin()
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
    })
  })

  it('nao chama a api ao clicar em Esqueceu?', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter {...router} initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Esqueceu?' }))
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('mantem a sessao apenas no localStorage', async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === '/api/auth/login') {
        return testSessionResponse
      }
      throw new Error(`Unexpected apiRequest path: ${path}`)
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter {...router} initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Entrar' })
    await user.type(screen.getByLabelText('Usuário'), 'arthur')
    await user.type(screen.getByLabelText('Senha'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
    })

    expect(sessionStorage.getItem('bridgit.session')).toBeNull()
    const first = localStorage.getItem('bridgit.session')
    const second = localStorage.getItem('bridgit.session')
    expect(first).toBe(second)
    expect(first).toContain('test-token')
  })

  it('descarta sessao nao persistente sem cookie do navegador', async () => {
    localStorage.setItem(
      'bridgit.session',
      JSON.stringify({
        accessToken: 'test-token',
        expiresAt: testSessionResponse.expiresAt,
        user: { id: 'user-1', username: 'arthur' },
        session: { id: 'session-1', persistent: false },
      }),
    )
    document.cookie = ''

    render(
      <MemoryRouter {...router} initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    })
    expect(localStorage.getItem('bridgit.session')).toBeNull()
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('depois de sair, entrar abre a home', async () => {
    const user = userEvent.setup()
    apiRequest.mockImplementation(async (path) => {
      if (path === '/api/auth/refresh' || path === '/api/auth/login') {
        return testSessionResponse
      }
      if (path === '/api/auth/logout') {
        return { message: 'ok' }
      }
      throw new Error(`Unexpected apiRequest path: ${path}`)
    })
    seedAuthenticatedSession()

    render(
      <MemoryRouter {...router} initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Usuário'), 'arthur')
    await user.type(screen.getByLabelText('Senha'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog', { name: 'Configurações' })).not.toBeInTheDocument()
  })

  it('excluir conta abre o login', async () => {
    const user = userEvent.setup()
    apiRequest.mockImplementation(async (path) => {
      if (path === '/api/auth/refresh') {
        return testSessionResponse
      }
      if (path === '/api/account') {
        return { message: 'ok' }
      }
      throw new Error(`Unexpected apiRequest path: ${path}`)
    })
    seedAuthenticatedSession()

    render(
      <MemoryRouter {...router} initialEntries={['/settings/security']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Excluir conta' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Toda a nuvem/ })).not.toBeInTheDocument()
  })
})
