'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

function isBlockedAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
      normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('ff');
  }
  return true;
}

async function assertPublicCallbackUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('callback_url must be a valid HTTP or HTTPS URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('callback_url must be a valid HTTP or HTTPS URL without credentials');
  }
  if (!url.hostname) throw new Error('callback_url must include a hostname');
  if (!net.isIP(url.hostname)) {
    const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
      throw new Error('callback_url must resolve to a public network address');
    }
  } else if (isBlockedAddress(url.hostname)) {
    throw new Error('callback_url must use a public network address');
  }
  return url.toString();
}

module.exports = { assertPublicCallbackUrl, isBlockedAddress };
