import { networkInterfaces } from 'node:os';

/**
 * Which "network" a client is on, for the open-battles list: every private / loopback address is
 * the local network ('lan'); a public address (a home router seen by an internet server) is its
 * own network. So on a LAN everyone sees every room, and on a public server players only see
 * rooms from their own home network.
 */
export function networkOf(address: string | undefined): string {
  const ip = (address ?? '').replace(/^::ffff:/, '').toLowerCase();
  if (!ip) return 'lan';
  const v4 = ip.split('.').map(Number);
  if (v4.length === 4 && v4.every((n) => Number.isInteger(n))) {
    const [a, b] = v4;
    const priv = a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
    return priv ? 'lan' : ip;
  }
  // IPv6: loopback, unique-local (fc00::/7) and link-local (fe80::/10) are local.
  if (ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip)) return 'lan';
  // A home's /64 prefix (expand "::" first so equal prefixes compare equal).
  const parts = ip.split('%')[0].split(':');
  const gap = parts.indexOf('');
  if (gap >= 0) {
    const head = parts.slice(0, gap).filter((p) => p !== '');
    const tail = parts.slice(gap).filter((p) => p !== '');
    parts.splice(0, parts.length, ...head, ...Array<string>(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail);
  }
  return parts
    .slice(0, 4)
    .map((p) => p.replace(/^0+(?=.)/, ''))
    .join(':');
}

/** A network address of this machine, with the adapter it belongs to. */
export interface LanAddress {
  ip: string;
  /** The adapter's name as the system gives it ("Wi-Fi", "en0", "wlan0"). */
  adapter: string;
  /** Looks like a virtual adapter (VMs, containers, VPNs): phones can't reach it. */
  virtual: boolean;
}

// Virtual adapters (WSL, Hyper-V, Docker and its networks, VirtualBox, VMware, libvirt, macOS
// Internet-sharing bridges, VPNs and overlay networks) can't be reached from a phone.
const VIRTUAL = /vethernet|virtual|vmware|vmnet|vbox|docker|^br-|virbr|^bridge\d|wsl|hyper-v|tailscale|zerotier|^zt|loopback|utun|tun|tap|^wg\d|wireguard|nordlynx|proton|openvpn|anyconnect|cisco|forti|hamachi|radmin|^ppp/;

/**
 * IPv4 addresses of this machine's network interfaces, likely Wi-Fi / LAN first: real adapters
 * before virtual ones (those only if nothing else is there), private addresses first, Wi-Fi
 * before wired, a home router's 192.168.x.x before other private ranges.
 */
export function lanInterfaces(interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()): LanAddress[] {
  const out: (LanAddress & { score: number })[] = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const n = name.toLowerCase();
      const priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      const wifi = /wi-?fi|wlan|wireless|en0|en1/.test(n);
      out.push({ ip: a.address, adapter: name, virtual: VIRTUAL.test(n), score: (priv ? 5 : 0) + (wifi ? 2 : 0) + (a.address.startsWith('192.168.') ? 1 : 0) });
    }
  }
  // Virtual adapters only as a last resort.
  const real = out.filter((a) => !a.virtual);
  return (real.length ? real : out).sort((a, b) => b.score - a.score).map(({ ip, adapter, virtual }) => ({ ip, adapter, virtual }));
}

/** IPv4 addresses of this machine, likely Wi-Fi / LAN first (see lanInterfaces). */
export function lanAddresses(): string[] {
  return lanInterfaces().map((a) => a.ip);
}
