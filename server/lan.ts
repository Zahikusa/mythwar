import { networkInterfaces } from 'node:os';

/** IPv4 addresses of this machine's network interfaces, likely Wi-Fi / LAN first. */
export function lanAddresses(): string[] {
  const out: { ip: string; score: number }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const n = name.toLowerCase();
      // Virtual adapters (WSL, Hyper-V, Docker, VPNs) can't be reached from a phone.
      const virtual = /vethernet|virtual|vmware|vbox|docker|wsl|hyper-v|tailscale|zerotier|loopback|utun|tun|tap/.test(n);
      const priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      const wifi = /wi-?fi|wlan|wireless|en0|en1/.test(n);
      out.push({ ip: a.address, score: (virtual ? -10 : 0) + (priv ? 5 : 0) + (wifi ? 2 : 0) });
    }
  }
  return out.sort((a, b) => b.score - a.score).map((a) => a.ip);
}
