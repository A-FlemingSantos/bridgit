import { isValidLinkAlias, MAX_LINK_ALIAS_LENGTH, normalizeLinkAlias } from '@bridgit/shared-client'

// Pure logic of the public link sheet: the apelido draft and the messages for the server's errors.

const ERROR_MESSAGES = {
  APELIDO_INVALIDO: 'Use só letras, números e hífens, até 60 caracteres.',
  APELIDO_INDISPONIVEL: 'Este apelido já está em uso. Escolha outro.',
  LINK_NAO_ENCONTRADO: 'Este link não existe mais.',
}

export function linkTitle(kind) {
  return kind === 'folder' ? 'Pasta pública' : 'Link público'
}

// What the visitors can do, for the sheet shown before a link exists.
export function linkExplanation(kind) {
  return kind === 'folder'
    ? 'Qualquer pessoa com o link poderá navegar por esta pasta e suas subpastas, só para leitura.'
    : 'Qualquer pessoa com o link poderá ver e baixar este arquivo, só para leitura.'
}

// The apelido as it would be saved: what the draft becomes once normalized.
export function aliasPreview(draft) {
  return normalizeLinkAlias(draft)
}

// Checks the draft against the link's current apelido.
// Returns { alias, error, changed, canSave }; an empty draft is an error, shown once the draft differs.
export function checkAliasDraft(draft, currentAlias) {
  const alias = aliasPreview(draft)
  const changed = alias !== (currentAlias ?? '')

  let error = null
  if (!alias) error = 'Digite um apelido.'
  else if (alias.length > MAX_LINK_ALIAS_LENGTH) error = `O apelido pode ter até ${MAX_LINK_ALIAS_LENGTH} caracteres.`
  else if (!isValidLinkAlias(alias)) error = ERROR_MESSAGES.APELIDO_INVALIDO

  return { alias, error, changed, canSave: changed && error === null }
}

// The message for a failed enable/update/disable; null when the error is not one the sheet maps.
export function linkErrorMessage(error) {
  return ERROR_MESSAGES[error?.code] ?? null
}

// The sheet draws the address around the apelido field as "…/p/" + field + "-<codigo>".
export const ADDRESS_PREFIX = '…/p/'

export function addressSuffix(code) {
  return code ? `-${code}` : ''
}
