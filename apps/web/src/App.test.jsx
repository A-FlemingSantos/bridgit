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
