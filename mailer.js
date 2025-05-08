const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'eliteformals1@gmail.com', // Your Gmail address
    pass: 'lxmu zqqc jzvv kpba'  // Your app-specific password
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verify connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.log('Error with SMTP configuration:', error);
  } else {
    console.log('SMTP configuration is correct');
  }
});

module.exports = transporter;
