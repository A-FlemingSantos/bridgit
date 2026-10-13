// Pure helpers for files the app downloads to hand to another app.
export function safeName(name) {
  const cleaned = String(name ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return cleaned || 'arquivo'
}

function header(headers, name) {
  const key = Object.keys(headers ?? {}).find((entry) => entry.toLowerCase() === name)
  return key ? headers[key] : null
}

// The server names the download (e.g. a Google Doc exported as "Nome.docx"); prefer that name.
export function fileNameFrom(headers, fallback) {
  const disposition = header(headers, 'content-disposition') ?? ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (encoded) {
    try {
      return safeName(decodeURIComponent(encoded[1]))
    } catch {
      // Malformed encoding: fall through to the plain name.
    }
  }
  const plain = disposition.match(/filename="([^"]+)"/i)
  return safeName(plain ? plain[1] : fallback)
}

// The bytes may differ from the stored type (Google Docs are exported to Office or PDF).
export function contentType(headers, mimeType) {
  const sent = String(header(headers, 'content-type') ?? '').split(';')[0].trim()
  if (sent && sent !== 'application/octet-stream') return sent
  return mimeType && !mimeType.startsWith('application/vnd.google-apps.') ? mimeType : '*/*'
}
