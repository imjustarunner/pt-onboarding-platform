/**
 * Utility to extract client IP address from request
 * Handles proxy headers (X-Forwarded-For) and IPv6/IPv4 addresses
 */
export function getClientIpAddress(req) {
  // Check X-Forwarded-For header first (for proxies/load balancers)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one (original client)
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }

  // Check X-Real-IP header (some proxies use this)
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp.trim();
  }

  // Fall back to Express's req.ip (requires trust proxy to be set)
  if (req.ip && req.ip !== '::1' && req.ip !== '127.0.0.1') {
    return req.ip;
  }

  // Last resort: connection remote address
  const remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
  if (remoteAddress && remoteAddress !== '::1' && remoteAddress !== '127.0.0.1') {
    return remoteAddress;
  }

  // For localhost, return a descriptive value
  if (remoteAddress === '::1' || remoteAddress === '127.0.0.1' || req.ip === '::1' || req.ip === '127.0.0.1') {
    return 'localhost';
  }

  return 'unknown';
}

