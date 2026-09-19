import { render, screen, waitForElementToBeRemoved, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App.jsx'

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

describe('App', () => {
  it('mostra a landing na raiz', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /Toda a nuvem,\s*num só lugar/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
    expect(screen.getAllByRole('link', { name: 'Criar conta' })[0]).toHaveAttribute('href', '/register')
  })

  it('mostra o login em duas colunas', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/register')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('mostra os provedores na home', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/home')
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

  it('mostra os spaces e abre o par de sinc', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter {...router} initialEntries={['/spaces']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Spaces' })).toBeInTheDocument()
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
    render(
      <MemoryRouter {...router} initialEntries={['/spaces']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Novo space' }))

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
    render(
      <MemoryRouter {...router} initialEntries={['/spaces']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Novo space' }))
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

  it('mostra as ações de um arquivo no provedor', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter {...router} initialEntries={['/providers/onedrive']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Ações de Relatório 2023' }))
    expect(screen.getByRole('menuitem', { name: 'Espelhar' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Link público' })).toBeInTheDocument()
  })

  it('mostra conflitos no space', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/s/curriculo']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('textbox', { name: 'Nome do space' })).toHaveValue('Currículo')
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

  it('mostra as pastas ancestrais de um arquivo aninhado', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/providers/onedrive/file/f2b8d4c1-7e50-4a91-8c36-1d9e5a0b7f24']}>
        <App />
      </MemoryRouter>,
    )

    const nav = screen.getByRole('navigation', { name: 'Localização atual' })
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

  it('mostra a lista de um provedor', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/providers/onedrive']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'OneDrive' })).toBeInTheDocument()
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

  it('mostra a aba de conta nas configurações', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Configurações' })
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

  it('mostra os provedores na aba correspondente', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/settings/providers']}>
        <App />
      </MemoryRouter>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Configurações' })
    expect(within(dialog).getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
    expect(within(dialog).getByText('arthur@outlook.com')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('button', { name: 'Desconectar' })).toHaveLength(2)
    expect(within(dialog).getByRole('button', { name: 'Conectar' })).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Usuário')).not.toBeInTheDocument()
  })

  it('mostra os spaces na sincronização', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/settings/sync']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Sincronização' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Avisar se a sincronização falhar' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('link', { name: 'Scripts' })).toHaveAttribute('href', '/s/scripts')
    expect(screen.getByRole('switch', { name: 'Pausar Scripts' })).toHaveAttribute('aria-checked', 'true')
  })

  it('mostra senha e sessão na aba de segurança', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/settings/security']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText('Senha atual')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar senha' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encerrar outras sessões' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excluir conta' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Manter este dispositivo' })).toBeInTheDocument()
  })

  it('abre configurações sobre a página anterior e fecha no painel', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter {...router} initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: 'Configurações' }))

    const dialog = screen.getByRole('dialog', { name: 'Configurações' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Conta' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Fechar configurações' }))

    await waitForElementToBeRemoved(() => screen.queryByRole('dialog', { name: 'Configurações' }))
    expect(screen.getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
  })

  it('mostra o cadastro na mesma tela', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/register']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Cadastro' })).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar senha')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeInTheDocument()
  })
})
