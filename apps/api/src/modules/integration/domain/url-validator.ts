import net from 'node:net';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { InvalidWebhookUrlError } from './integration-errors.js';

export interface UrlValidationOptions {
  readonly allowLocalhost?: boolean;
  readonly requireHttps?: boolean;
}

export interface SafeHttpRequestOptions {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly timeoutMs?: number;
  readonly allowLocalhost?: boolean;
  readonly requireHttps?: boolean;
}

export interface SafeHttpResponse {
  readonly status: number;
  readonly durationMs: number;
  readonly body: string;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  if (typeof ip !== 'string') return true;
  const lower = ip.toLowerCase();

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:a00:1)
  if (lower.startsWith('::ffff:')) {
    return true;
  }

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [p0, p1, p2] = parts;
    if (p0 === undefined || p1 === undefined) return true;

    // 0.0.0.0/8 (current network)
    if (p0 === 0) return true;
    // 127.0.0.0/8 (loopback)
    if (p0 === 127) return true;
    // 10.0.0.0/8 (private)
    if (p0 === 10) return true;
    // 172.16.0.0/12 (private: 172.16.0.0 - 172.31.255.255)
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    // 192.168.0.0/16 (private)
    if (p0 === 192 && p1 === 168) return true;
    // 169.254.0.0/16 (link-local)
    if (p0 === 169 && p1 === 254) return true;
    // 100.64.0.0/10 (carrier NAT)
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;
    // 198.18.0.0/15 (benchmark)
    if (p0 === 198 && (p1 === 18 || p1 === 19)) return true;
    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (test networks)
    if (p0 === 192 && p1 === 0 && p2 === 2) return true;
    if (p0 === 198 && p1 === 51 && p2 === 100) return true;
    if (p0 === 203 && p1 === 0 && p2 === 113) return true;
    // 224.0.0.0/4 (multicast) & 240.0.0.0/4 (reserved)
    if (p0 >= 224) return true;
    // 255.255.255.255 (broadcast)
    if (ip === '255.255.255.255') return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    // ::1 (loopback)
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
    // :: (unspecified)
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
    // fe80::/10 (link-local)
    if (
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    ) {
      return true;
    }
    // fc00::/7 (unique local)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // ff00::/8 (multicast)
    if (lower.startsWith('ff')) return true;
    // 2001:db8::/32 (documentation)
    if (lower.startsWith('2001:db8')) return true;
    // 64:ff9b::/96 (IPv4-IPv6 translation)
    if (lower.startsWith('64:ff9b:')) return true;

    return false;
  }

  return true;
}

export function createSsrfSafeLookup(options: UrlValidationOptions = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowLocalhost = Boolean(options.allowLocalhost) && !isProduction;

  return function ssrfLookup(
    hostname: string,
    dnsOptions: dns.LookupOptions | undefined,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | dns.LookupAddress[],
      family?: number,
    ) => void,
  ) {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err, '' as unknown as string);
      if (!addresses || addresses.length === 0) {
        return callback(
          new InvalidWebhookUrlError(`No DNS addresses resolved for ${hostname}`),
          '' as unknown as string,
        );
      }

      for (const addr of addresses) {
        const isLoopback = addr.address === '127.0.0.1' || addr.address === '::1';
        if (isLoopback && allowLocalhost) {
          continue;
        }
        if (isPrivateOrReservedIp(addr.address)) {
          return callback(
            new InvalidWebhookUrlError(
              `SSRF connection blocked: address ${addr.address} for host ${hostname} is private or reserved`,
            ),
            '' as unknown as string,
          );
        }
      }

      if (dnsOptions && dnsOptions.all) {
        callback(null, addresses);
      } else {
        const first = addresses[0]!;
        callback(null, first.address, first.family);
      }
    });
  };
}

export async function validateWebhookUrl(
  urlString: string,
  options: UrlValidationOptions = {},
): Promise<string> {
  if (typeof urlString !== 'string' || !urlString.trim()) {
    throw new InvalidWebhookUrlError('Webhook URL cannot be empty');
  }
  if (urlString.length > 2048) {
    throw new InvalidWebhookUrlError('Webhook URL exceeds maximum length of 2048 characters');
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new InvalidWebhookUrlError('Malformed webhook URL');
  }

  // Scheme validation
  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  if (options.requireHttps && scheme !== 'https') {
    throw new InvalidWebhookUrlError('Webhook URL must use HTTPS');
  }
  if (scheme !== 'http' && scheme !== 'https') {
    throw new InvalidWebhookUrlError(
      `Unsupported webhook scheme: ${scheme}. Only HTTP and HTTPS are permitted`,
    );
  }

  // Reject credentials in URL
  if (parsed.username || parsed.password) {
    throw new InvalidWebhookUrlError('Webhook URL must not contain embedded user credentials');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const effectiveAllowLocalhost = Boolean(options.allowLocalhost) && !isProduction;

  if (options.allowLocalhost && isProduction) {
    throw new InvalidWebhookUrlError(
      'Localhost destinations are strictly prohibited in production',
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // Localhost check
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    if (effectiveAllowLocalhost) {
      return parsed.toString();
    }
    throw new InvalidWebhookUrlError('Webhook destination cannot be localhost or loopback address');
  }

  // IP address check
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname) && !effectiveAllowLocalhost) {
      throw new InvalidWebhookUrlError(`Webhook destination IP ${hostname} is private or reserved`);
    }
    return parsed.toString();
  }

  // Domain DNS resolution check upfront (preflight check)
  if (!effectiveAllowLocalhost) {
    await new Promise<void>((resolve, reject) => {
      dns.lookup(hostname, { all: true }, (err, addresses) => {
        if (err) {
          return reject(
            new InvalidWebhookUrlError(`Failed to resolve webhook domain: ${hostname}`),
          );
        }
        for (const addr of addresses) {
          if (isPrivateOrReservedIp(addr.address)) {
            return reject(
              new InvalidWebhookUrlError(
                `Webhook domain ${hostname} resolves to private or reserved IP: ${addr.address}`,
              ),
            );
          }
        }
        resolve();
      });
    });
  }

  return parsed.toString();
}

export async function assertSafeEndpointUrl(
  urlString: string,
  options?: UrlValidationOptions,
): Promise<string> {
  return validateWebhookUrl(urlString, options);
}

export async function sendSafeWebhookHttpRequest(
  urlString: string,
  options: SafeHttpRequestOptions = {},
): Promise<SafeHttpResponse> {
  const safeUrl = await validateWebhookUrl(urlString, options);
  const parsed = new URL(safeUrl);
  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  const isHttps = scheme === 'https';

  const isProduction = process.env.NODE_ENV === 'production';
  const effectiveAllowLocalhost = Boolean(options.allowLocalhost) && !isProduction;

  const lookup = createSsrfSafeLookup({
    allowLocalhost: effectiveAllowLocalhost,
  }) as unknown as net.LookupFunction;
  const agent = isHttps
    ? new https.Agent({ lookup, keepAlive: false })
    : new http.Agent({ lookup, keepAlive: false });

  const transport = isHttps ? https : http;
  const timeoutMs = options.timeoutMs ?? 10000;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const req = transport.request(
      parsed,
      {
        method: options.method ?? 'POST',
        headers: options.headers ?? {},
        agent,
        servername: isHttps ? parsed.hostname : undefined, // TLS SNI correctness
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            durationMs: Date.now() - startTime,
            body: data.slice(0, 500),
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}
