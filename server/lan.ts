import os from 'node:os';
import type { LanAddress } from '../shared/types.js';

type Interfaces = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

/** Interface name prefixes that are almost never what a phone can reach. */
const VIRTUAL_IFACE =
  /^(docker|br-|veth|virbr|vmnet|vboxnet|vethernet|tun|tap|utun|wg|tailscale|zt|lxc|lxd|cni|flannel|podman)/i;

/** Lower is better. Home routers and phone hotspots mostly hand out 192.168.x.x or 10.x.x.x. */
function rangeRank(address: string): number {
  const [a = 0, b = 0] = address.split('.').map(Number);
  if (a === 192 && b === 168) return 0;
  if (a === 10) return 1;
  if (a === 172 && b >= 16 && b <= 31) return 2;
  return 3;
}

/**
 * Lists the IPv4 URLs other devices on the LAN can use to reach this server,
 * best guess first. Skips loopback and link-local (169.254.x.x) addresses.
 */
export function findLanAddresses(
  interfaces: Interfaces,
  port: number,
  protocol: 'http' | 'https' = 'http',
): LanAddress[] {
  const found: LanAddress[] = [];
  for (const [iface, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254.')) continue;
      found.push({
        iface,
        address: info.address,
        url: `${protocol}://${info.address}:${port}`,
        virtual: VIRTUAL_IFACE.test(iface),
      });
    }
  }
  return found.sort(
    (x, y) =>
      Number(x.virtual) - Number(y.virtual) ||
      rangeRank(x.address) - rangeRank(y.address) ||
      x.iface.localeCompare(y.iface),
  );
}

/** Same as {@link findLanAddresses}, reading this machine's interfaces. */
export function lanAddresses(port: number): LanAddress[] {
  return findLanAddresses(os.networkInterfaces(), port);
}
