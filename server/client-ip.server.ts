import { BlockList, isIP } from "node:net";
import { env } from "./env.server";
function trusted(address: string) {
  const ip = address.replace(/^::ffff:/, "");
  return env.AUTH_TRUSTED_PROXIES.split(",")
    .filter(Boolean)
    .some((value) => {
      const [network, prefix] = value.trim().split("/");
      const type = isIP(network) === 6 ? "ipv6" : "ipv4";
      const list = new BlockList();
      if (prefix) list.addSubnet(network, Number(prefix), type);
      else list.addAddress(network, type);
      return list.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");
    });
}
export function rateLimitAddress(value: string) {
  const ip = value.replace(/^::ffff:/, "");
  if (isIP(ip) !== 6) return ip;
  const canonical = new URL("http://[" + ip + "]/").hostname.slice(1, -1);
  const halves = canonical.split("::"),
    left = halves[0].split(":").filter(Boolean),
    right = (halves[1] ?? "").split(":").filter(Boolean);
  return (
    [
      ...left,
      ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"),
      ...right,
    ]
      .slice(0, 4)
      .join(":") + "::"
  );
}
// Always overwrite this private header at the Node boundary, never accept it from clients.
export function setSocketAddress(req: {
  headers: Record<string, unknown>;
  socket: { remoteAddress?: string };
}) {
  const peer = req.socket.remoteAddress ?? "";
  let address = peer;
  if (env.AUTH_IP_HEADERS && trusted(peer)) {
    address = "";
    for (const name of env.AUTH_IP_HEADERS.split(",")) {
      const header = req.headers[name.trim().toLowerCase()];
      if (typeof header !== "string") continue;
      const chain = [...header.split(",").map((v) => v.trim()), peer];
      if (chain.some((ip) => !isIP(ip))) continue;
      address = [...chain].reverse().find((ip) => !trusted(ip)) ?? "";
      if (address) break;
    }
  }
  req.headers["x-lightscore-socket-ip"] = rateLimitAddress(address);
}
