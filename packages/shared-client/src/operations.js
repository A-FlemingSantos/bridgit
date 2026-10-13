import { apiRequest } from './apiClient.js'

export function submitOperation(token, request) {
  return apiRequest('/api/operations', { token, method: 'POST', body: request })
}
export function submitUploadOperation(token, request, file) {
  const body = new FormData()
  // A plain text field: React Native's FormData cannot send a JSON Blob, and the API parses the text.
  body.append('request', JSON.stringify(request))
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
