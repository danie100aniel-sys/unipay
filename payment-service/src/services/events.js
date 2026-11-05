'use strict';

const EventEmitter = require('events');

class PaymentEmitter extends EventEmitter {}
const paymentEvents = new PaymentEmitter();

// Increase limit if you expect many simultaneous checkouts/admins
paymentEvents.setMaxListeners(100); 

module.exports = paymentEvents;