import { useConnections } from '../hub/hooks'
import { resolveConnectionId } from './resolveConnectionId'

// status: 'resolving' while the provider list is still loading and the route cannot name its account yet,
// 'ready' once it does, 'missing' when the provider list is loaded and the route's account is not in it.
// `connection` is the account's row when the list has it.
export function useRouteConnection(params) {
  const { status: listStatus, connections, connectionById } = useConnections()
  const connectionId = resolveConnectionId(connections, params ?? {})
  const connection = connectionId ? connectionById(connectionId) ?? null : null
  let status = 'ready'
  if (!connectionId && listStatus !== 'ready') status = 'resolving'
  else if (!connectionId || (!connection && listStatus === 'ready')) status = 'missing'
  return { status, connectionId, connection, listStatus }
}
