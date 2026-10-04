# Autenticação e sessões

A validade da sessão é controlada **no servidor** (tabela `user_sessions`). Não há cookies: o cliente envia `Authorization: Bearer <token>`.

## Token

- JWT HS256 assinado com `APP_JWT_SECRET`, com `sub`, `username`, `sid` (id da sessão) e `iss`.
- O JWT **não tem `exp`**. Quem decide se a sessão vale é a linha em `user_sessions`: revogada, expirada ou inexistente resulta em 401.
- Códigos de 401 de sessão: `SESSAO_INVALIDA`, `SESSAO_REVOGADA`, `SESSAO_EXPIRADA`.
- Tickets de conteúdo (`/api/content/<ticket>`) são outros JWTs (emissor `bridgit-content`, 5 min) assinados com o mesmo segredo; não dependem da sessão.

## Tipo de cliente

`POST /api/auth/login` e `/api/auth/register` exigem `clientKind`: `web` ou `mobile` (valor inválido: 400 `CLIENTE_INVALIDO`). O valor é gravado na sessão (`client_kind`) e escolhe a regra de expiração. É declarado pelo cliente e serve como política de produto, não como fronteira de segurança.

## Regras de expiração

| Cliente | Regra |
|---|---|
| `mobile` | Nunca expira. Sempre `persistent=true`; não existe "Lembrar-me" nem "Manter este dispositivo". |
| `web`, sem "Lembrar-me" | Limite absoluto de 2 h a partir do login (`window_started_at`). Não é inatividade: uso contínuo não estende. Fechar e reabrir a página dentro das 2 h mantém o acesso. |
| `web`, com "Lembrar-me" | Renovada a cada uso (`last_seen_at`, atualizado no máximo a cada 5 min); expira após 7 dias sem uso. |

Alternar "Manter este dispositivo" com a sessão aberta (`PATCH /api/auth/session`):

- Desligar: nova janela de 2 h a partir do momento da troca.
- Ligar: passa a valer a regra deslizante de 7 dias, contada da troca.
- No mobile a troca é ignorada.

`expiresAt` (resposta de login/registro/refresh e `session.expiresAt`) é a expiração da sessão, `null` no mobile. `POST /api/auth/refresh` apenas revalida a sessão e devolve o estado atual.

Sessões expiradas ficam fora de `GET /api/auth/sessions`; um novo login no mesmo dispositivo substitui a sessão anterior.

## Clientes

- Web: a sessão fica em `localStorage` (`bridgit.session`); sem cookie. Ao abrir, revalida com `/api/auth/refresh`; sessões sem "Lembrar-me" fazem logout local em `expiresAt`.
- Mobile: a sessão fica no SecureStore e nunca é descartada localmente; só sai por logout ou por 401 do servidor.

## Configuração

- `APP_JWT_SECRET`: obrigatório em produção (o valor padrão do `application.yml` é só para desenvolvimento).
- `app.jwt.issuer`: emissor do JWT de sessão.
- O antigo `app.jwt.access-token-minutes` foi removido.
