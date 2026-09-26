export class HubUploadError extends Error {
  constructor(message, { uploaded = [], failed = [] } = {}) {
    super(message)
    this.name = 'HubUploadError'
    this.uploaded = uploaded
    this.failed = failed
  }
}

export function buildUploadErrorMessage(uploadedCount, totalCount, failedFiles) {
  const names = (failedFiles ?? []).map((entry) => entry?.file?.name ?? entry?.name ?? 'arquivo').join(', ')
  if (totalCount <= 1) {
    const only = (failedFiles ?? [])[0]
    const name = only?.file?.name ?? only?.name ?? 'arquivo'
    return `Falha ao enviar ${name}.`
  }
  return `${uploadedCount} de ${totalCount} arquivos enviados. Falhou: ${names}.`
}
