'use strict';
/**
 * Background workers entry point:  node src/worker.js
 *   1. callbackWorker — delivers signed fulfillment callbacks to websites, retries w/ backoff
 *   2. expiryWorker   — AWAITING_PAYMENT orders past their window -> EXPIRED
 *   3. retentionWorker— deletes resolved gift-card photos after the retention window
 */
require('./workers/callbackWorker').start();
require('./workers/expiryWorker').start();
require('./workers/retentionWorker').start();
console.log('workers running');
