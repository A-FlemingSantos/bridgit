import {
  ApiClientError,
  createFolder,
  deleteItem,
  getOperation,
  submitOperation,
  submitUploadOperation,
  updateItem,
  uploadFile,
} from '@bridgit/shared-client'

const TERMINAL = ['SUCCEEDED', 'REJECTED', 'NEEDS_ATTENTION', 'WAITING_RECONNECT']
const SUBMIT_ATTEMPTS = 3
const POLL_MS = 750
const MAX_POLLS = 80

// Hermes has no crypto.randomUUID. The key only has to be unique per user action.
export function createClientKey() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function retryable(error) {
  return error?.status === 0 || error?.status >= 500
}

function failure(operation) {
  return new ApiClientError(operation.errorMessage ?? 'Não foi possível concluir a operação.', {
    status: operation.status === 'NEEDS_ATTENTION' ? 503 : 409,
    code: operation.errorCode ?? 'OPERACAO_REJEITADA',
  })
}

// The durable journal accepts the write once (idempotent by clientKey) and runs it in order on the server.
// Resubmitting after a lost response reuses the same clientKey, so it can never create a duplicate.
async function runDurable(token, request, file) {
  let accepted = null
  for (let attempt = 0; !accepted; attempt += 1) {
    try {
      accepted = file ? await submitUploadOperation(token, request, file) : await submitOperation(token, request)
    } catch (error) {
      if (!retryable(error) || attempt + 1 >= SUBMIT_ATTEMPTS) throw error
      await wait(250 * 2 ** attempt)
    }
  }

  for (let poll = 0; !TERMINAL.includes(accepted.status); poll += 1) {
    if (poll >= MAX_POLLS) {
      throw new ApiClientError('A operação continua em andamento no servidor.', {
        status: 202,
        code: 'OPERACAO_EM_ANDAMENTO',
      })
    }
    await wait(POLL_MS)
    try {
      accepted = await getOperation(token, accepted.id)
    } catch (error) {
      // The server owns accepted work; a failed poll must not turn into a second write.
      if (!retryable(error)) throw error
    }
  }

  if (accepted.status !== 'SUCCEEDED') throw failure(accepted)
  return accepted.item
}

// Runs one create-folder, rename, delete or upload. Uses the durable operations path when the
// provider connection supports it, and the idempotent legacy routes otherwise.
export async function runOperation(token, connection, { kind, ref, parentRef, name, file, version }) {
  const clientKey = createClientKey()
  const durable = Boolean(connection?.connectionId) && connection.operationsEnabled !== false

  if (durable) {
    const request = {
      clientKey,
      provider: connection.id,
      kind,
      connectionId: connection.connectionId,
      generation: connection.generation,
      ...(ref ? { ref, expectedVersion: version ?? null } : {}),
      ...(parentRef !== undefined ? { parentRef } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(file ? { name: file.name, contentType: file.type } : {}),
    }
    const item = await runDurable(token, request, file)
    return kind === 'DELETE' ? { deleted: true } : item
  }

  const options = { clientKey }
  const provider = connection.id
  if (kind === 'CREATE_FOLDER') return createFolder(token, provider, parentRef, name, options)
  if (kind === 'UPDATE') return updateItem(token, provider, ref, { name, parentRef }, options)
  if (kind === 'DELETE') return deleteItem(token, provider, ref, options)
  if (kind === 'UPLOAD') return uploadFile(token, provider, parentRef, file, options)
  throw new Error(`Operação desconhecida: ${kind}`)
}
