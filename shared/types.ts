/** Default HTTP/WebSocket port. Override with the PORT env var. */
export const DEFAULT_PORT = 3000;

/** One way to reach the server from another device on the LAN. */
export interface LanAddress {
  /** OS network interface name, e.g. "wlan0" or "en0". */
  iface: string;
  /** IPv4 address on that interface. */
  address: string;
  /** Full URL to open on a phone, e.g. "http://192.168.0.12:3000". */
  url: string;
  /** True for interfaces that are probably virtual (Docker, VPN, VM bridges). */
  virtual: boolean;
}

/** Response body of `GET /api/info`. */
export interface ServerInfo {
  name: string;
  port: number;
  /** Best guess first: the URL friends should use. */
  urls: LanAddress[];
}
