import { describe, expect, it } from 'vitest';
import type { networkInterfaces } from 'node:os';
import { lanInterfaces } from '../server/lan.ts';

type Ifaces = ReturnType<typeof networkInterfaces>;
const v4 = (address: string, internal = false) => ({ address, family: 'IPv4', internal, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: `${address}/24` }) as NonNullable<Ifaces[string]>[number];

describe('lanInterfaces (which address the QR code shows — backlog 176)', () => {
  it('puts the Wi-Fi first, names each adapter, leaves out loopback and IPv6', () => {
    const list = lanInterfaces({
      'Ethernet 3': [v4('10.0.0.7')],
      WLAN: [v4('192.168.1.105'), { ...v4('fe80::1'), family: 'IPv6' } as never],
      'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
    });
    expect(list.map((a) => `${a.ip} ${a.adapter}`)).toEqual(['192.168.1.105 WLAN', '10.0.0.7 Ethernet 3']);
  });

  it('drops virtual adapters — VMs, containers, VPNs — while a real one is there', () => {
    const list = lanInterfaces({
      'vEthernet (WSL)': [v4('172.20.0.1')],
      'br-3f2a9c': [v4('172.18.0.1')],
      virbr0: [v4('192.168.122.1')],
      vmnet8: [v4('192.168.56.1')],
      bridge100: [v4('192.168.2.1')],
      wg0: [v4('10.8.0.2')],
      NordLynx: [v4('10.5.0.2')],
      'ProtonVPN TUN': [v4('10.2.0.2')],
      eth0: [v4('192.168.0.20')],
    });
    expect(list.map((a) => a.ip)).toEqual(['192.168.0.20']);
  });

  it('a home router’s 192.168.x.x before another private range on an equal footing', () => {
    expect(lanInterfaces({ eth1: [v4('10.1.2.3')], eth0: [v4('192.168.178.20')] })[0].ip).toBe('192.168.178.20');
  });

  it('only virtual adapters: still listed (last resort), and marked as such', () => {
    const list = lanInterfaces({ 'vEthernet (Default Switch)': [v4('172.17.80.1')] });
    expect(list).toEqual([{ ip: '172.17.80.1', adapter: 'vEthernet (Default Switch)', virtual: true }]);
  });
});
