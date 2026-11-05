'use strict';
/** Serves the embeddable widget: GET /widget.js (static file, cacheable). */
const express = require('express');
const path = require('path');
module.exports = express.static(path.join(__dirname, '../widget'), {
  index: false, setHeaders: (res) => res.setHeader('cache-control', 'public, max-age=3600'),
});
