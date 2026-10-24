import { describe, expect, it } from 'vitest'
import { MAX_EDITABLE_TEXT_BYTES, editableTextTooLargeError } from './limits.js'

describe('editable text limit', () => {
  it('is 2 MB and names itself in the error', () => {
    expect(MAX_EDITABLE_TEXT_BYTES).toBe(2 * 1024 * 1024)
    expect(editableTextTooLargeError()).toMatchObject({
      code: 'TEXTO_GRANDE_DEMAIS', status: 400, message: 'O texto passou de 2 MB e não pode ser salvo aqui.',
    })
  })
})
