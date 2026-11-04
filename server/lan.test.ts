import type os from 'node:os';
import { describe, expect, it } from 'vitest';
import { findLanAddresses } from './lan.js';

function v4(address: string, internal = false): os.NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/24`,
  };
}

function v6(address: string): os.NetworkInterfaceInfo {
  return {
    address,
    netmask: 'ffff:ffff:ffff:ffff::',
    family: 'IPv6',
    mac: '00:00:00:00:00:00',
    internal: false,
    cidr: `${address}/64`,
    scopeid: 0,
  };
}

describe('findLanAddresses', () => {
  it('skips loopback, IPv6 and link-local addresses', () => {
    const result = findLanAddresses(
      {
        lo: [v4('127.0.0.1', true)],
        wlan0: [v4('192.168.0.12'), v6('fe80::1')],
        eth9: [v4('169.254.10.10')],
      },
      3000,
    );
    expect(result).toEqual([
      { iface: 'wlan0', address: '192.168.0.12', url: 'http://192.168.0.12:3000', virtual: false },
    ]);
  });

  it('puts real interfaces before virtual ones (Docker, VPN, VM bridges)', () => {
    const result = findLanAddresses(
      {
        docker0: [v4('172.17.0.1')],
        tailscale0: [v4('100.64.0.5')],
        'br-1a2b': [v4('192.168.49.1')],
        wlan0: [v4('172.20.10.4')],
      },
      3000,
    );
    expect(result.map((a) => a.iface)).toEqual(['wlan0', 'br-1a2b', 'docker0', 'tailscale0']);
    expect(result.map((a) => a.virtual)).toEqual([false, true, true, true]);
  });

  it('prefers 192.168.x, then 10.x, then 172.16-31.x, then anything else', () => {
    const result = findLanAddresses(
      {
        a: [v4('100.70.1.1')],
        b: [v4('172.16.5.5')],
        c: [v4('10.42.0.1')],
        d: [v4('192.168.43.7')],
      },
      3000,
    );
    expect(result.map((a) => a.address)).toEqual([
      '192.168.43.7',
      '10.42.0.1',
      '172.16.5.5',
      '100.70.1.1',
    ]);
  });

  it('uses the given port and protocol in the URL', () => {
    const [first] = findLanAddresses({ en0: [v4('10.0.0.2')] }, 8443, 'https');
    expect(first?.url).toBe('https://10.0.0.2:8443');
  });

  it('returns an empty list when there is no network', () => {
    expect(findLanAddresses({ lo: [v4('127.0.0.1', true)], tun0: undefined }, 3000)).toEqual([]);
  });
});
