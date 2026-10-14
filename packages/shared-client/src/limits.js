import { ApiClientError } from './apiClient.js'

// Keep in sync with UploadLimits.MAX_BYTES in the API. Clients check it before sending the body.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const MAX_UPLOAD_LABEL = '50 MB'

export function uploadTooLargeError() {
  return new ApiClientError(`O arquivo excede o limite de ${MAX_UPLOAD_LABEL}.`, {
    code: 'ARQUIVO_GRANDE',
    status: 400,
  })
}

// True when the file has a known size above the limit. Picked files without a size are left to the server.
export function exceedsUploadLimit(file) {
  return typeof file?.size === 'number' && file.size > MAX_UPLOAD_BYTES
}
