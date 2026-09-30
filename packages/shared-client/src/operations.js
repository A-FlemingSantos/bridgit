import { apiRequest } from './apiClient.js'

export function submitOperation(token, request) {
  return apiRequest('/api/operations', { token, method: 'POST', body: request })
}
export function submitUploadOperation(token, request, file) {
  const body = new FormData()
  body.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }))
  body.append('file', file)
  return apiRequest('/api/operations/uploads', { token, method: 'POST', body })
}
export function getOperation(token, id) {
  return apiRequest(`/api/operations/${encodeURIComponent(id)}`, { token })
}
export function listOperations(token) { return apiRequest('/api/operations', { token }) }
export function retryOperation(token, id) {
  return apiRequest(`/api/operations/${encodeURIComponent(id)}/retry`, { token, method: 'POST' })
}
export function getHubEvents(token, after = 0, signal) {
  return apiRequest('/api/hub/events', { token, query: { after }, signal })
}
export function getHubEventHead(token, signal) { return apiRequest('/api/hub/events/head', { token, signal }) }
