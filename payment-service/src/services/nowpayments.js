'use strict';

const config = require('../config');

const API_URL = config.nowpayments.apiUrl.replace(/\/+$/, '');

const CURRENCIES = Object.freeze({
  'USDT:TRON': 'usdttrc20',
  'USDT:SOLANA': 'usdtsol',
  'USDT:ETHEREUM': 'usdterc20',
  'USDT:BSC': 'usdtbsc',
  'USDT:POLYGON': 'usdtmatic',
  'USDT:ARBITRUM': 'usdtarb',
  'USDC:SOLANA': 'usdcsol',
  'USDC:BASE': 'usdcbase',
  'USDC:BSC': 'usdcbsc',
  'USDC:ARBITRUM': 'usdcarb',
});

async function createDeposit(order, asset, network) {
  const key = `${String(asset).trim().toUpperCase()}:${String(network).trim().toUpperCase()}`;
  const payCurrency = CURRENCIES[key];

  if (!payCurrency) {
    throw new Error('Unsupported cryptocurrency/network combination');
  }

  if (!config.nowpayments.apiKey) {
    throw new Error('NOWPayments API key is not configured');
  }

  const response = await fetch(`${API_URL}/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.nowpayments.apiKey,
    },
    body: JSON.stringify({
      price_amount: Number(order.amount_usd),
      price_currency: 'usd',
      pay_currency: payCurrency,
      order_id: order.order_id,
      order_description: `Order ${order.order_id}`,
      ipn_callback_url: `${process.env.PUBLIC_BASE_URL}/webhooks/nowpayments`,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`NOWPayments request failed (${response.status})`);
  }

  if (!data.payment_id || !data.pay_address || !data.pay_amount) {
    throw new Error('NOWPayments returned an incomplete payment response');
  }

  return {
    railRef: String(data.payment_id),
    address: data.pay_address,
    expectedAmount: data.pay_amount,
    expectedAsset: payCurrency,
    network: String(network).toUpperCase(),
    payCurrency,
  };
}

async function cancelPayment(railRef) {
  if (!config.nowpayments.apiKey) {
    throw new Error('NOWPayments API key is not configured');
  }

  const response = await fetch(
    `${API_URL}/payment/${encodeURIComponent(railRef)}`,
    {
      method: 'DELETE',
      headers: { 'x-api-key': config.nowpayments.apiKey },
    }
  );

  if (!response.ok) {
    throw new Error(`NOWPayments cancellation failed (${response.status})`);
  }
}

module.exports = {
  createDeposit,
  cancelPayment,
  CURRENCIES,
};
