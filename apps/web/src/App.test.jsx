import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App.jsx'

describe('App', () => {
  it('monta sem rotas de produto', () => {
    const { container } = render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>,
    )

    expect(container).toBeTruthy()
  })
})
