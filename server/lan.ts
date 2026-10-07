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
  return ip.split(':').slice(0, 4).join(':'); // a home's /64 prefix
}

/** IPv4 addresses of this machine's network interfaces, likely Wi-Fi / LAN first. */
export function lanAddresses(): string[] {
  const out: { ip: string; score: number; virtual: boolean }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const n = name.toLowerCase();
      // Virtual adapters (WSL, Hyper-V, Docker, VPNs) can't be reached from a phone.
      const virtual = /vethernet|virtual|vmware|vbox|docker|wsl|hyper-v|tailscale|zerotier|loopback|utun|tun|tap/.test(n);
      const priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      const wifi = /wi-?fi|wlan|wireless|en0|en1/.test(n);
      out.push({ ip: a.address, score: (priv ? 5 : 0) + (wifi ? 2 : 0), virtual });
    }
  }
  // Virtual adapters only as a last resort.
  const real = out.filter((a) => !a.virtual);
  return (real.length ? real : out).sort((a, b) => b.score - a.score).map((a) => a.ip);
}
