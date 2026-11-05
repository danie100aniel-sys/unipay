'use strict';
const config = require('../config');

async function phoenixApi(path) {
  // phoenixd typically uses HTTP Basic Auth with an empty username and your password/api key
  const res = await fetch(`${config.phoenixd.url}${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`:${config.phoenixd.password}`).toString('base64')}`,
    },
  });
  if (!res.ok) throw new Error(`phoenixd error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function createOnchainInvoice(order) {
  // Calls phoenixd built-in getbitcoinaddress endpoint
  const data = await phoenixApi('/getbitcoinaddress');
  
  return {
    railRef: data.address, // On-chain address serves as reference tracker
    address: `bitcoin:${data.address}?amount=...`, // Standard URI for QR codes
    expectedAmount: order.amount_usd,
    expectedAsset: 'BTC_ONCHAIN',
    requiredConfirmations: 1,
  };
}

module.exports = { createOnchainInvoice };