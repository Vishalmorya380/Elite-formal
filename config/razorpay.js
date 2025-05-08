// config/razorpay.js
const Razorpay = require('razorpay');
const razorpayInstance = new Razorpay({
  key_id: 'rzp_test_zIRQMLqhOL7ujV',
  key_secret: 'd7bvtj0falDNcUXCSf94dMDM'
});
module.exports = razorpayInstance;