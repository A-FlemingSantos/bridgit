import { render, screen } from '@testing-library/react'
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

  it('mostra os spaces e os provedores conectados', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/spaces']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Bridgit' })).toHaveAttribute('href', '/spaces')
    expect(screen.getByRole('heading', { name: 'Spaces' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Trabalho/ })).toHaveAttribute('href', '/spaces/trabalho')
    expect(screen.getByRole('link', { name: /OneDrive/ })).toHaveAttribute('href', '/providers/onedrive')
    expect(screen.getByRole('link', { name: /Google Drive/ })).toHaveAttribute('href', '/providers/google-drive')
  })

  it('mostra a lista achatada de um space', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/spaces/trabalho']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Trabalho' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova pasta' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Inovações técnicas/ })).toHaveAttribute(
      'href',
      '/spaces/trabalho/folder/4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334',
    )
    expect(screen.getByRole('link', { name: /Relatório 2023/ })).toHaveAttribute(
      'href',
      '/spaces/trabalho/file/a1c9e4d2-8f70-4b31-9c05-2d6e8a14b7f0',
    )
  })

  it('mostra a aba de conta nas configurações', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Conta' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Conta' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('link', { name: 'Provedores' })).toHaveAttribute('href', '/settings/providers')
    expect(screen.getByRole('link', { name: 'Sincronização' })).toHaveAttribute('href', '/settings/sync')
    expect(screen.getByRole('link', { name: 'Segurança' })).toHaveAttribute('href', '/settings/security')
    expect(screen.getByRole('link', { name: 'Sobre' })).toHaveAttribute('href', '/settings/about')
    expect(screen.getByLabelText('Usuário')).toHaveValue('arthur')
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Senha atual')).not.toBeInTheDocument()
    expect(screen.queryByText('OneDrive')).not.toBeInTheDocument()
  })

  it('mostra os provedores na aba correspondente', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/settings/providers']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Provedores' })).toBeInTheDocument()
    expect(screen.getByText('arthur@outlook.com')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Desconectar' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Conectar' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Usuário')).not.toBeInTheDocument()
  })

  it('mostra os interruptores de sincronização', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/settings/sync']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Sincronização' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Espelhar itens marcados' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByRole('switch', { name: 'Avisar se a sincronização falhar' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
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
