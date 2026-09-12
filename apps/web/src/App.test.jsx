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

  it('mostra a visualização de arquivos autenticada', () => {
    render(
      <MemoryRouter {...router} initialEntries={['/files']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Bridgit' })).toHaveAttribute('href', '/files')
    expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pastas' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Arquivos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Inovações técnicas/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Relatório 2023/ })).toBeInTheDocument()
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
