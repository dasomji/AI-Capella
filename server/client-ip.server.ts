
// This private header is always overwritten at the Node boundary, never accepted from a client.
export function setSocketAddress(req: {headers: Record<string, unknown>; socket: {remoteAddress?: string}}) {
  req.headers['x-lightscore-socket-ip'] = req.socket.remoteAddress ?? '';
}
