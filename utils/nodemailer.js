const nodemailer = require('nodemailer');

// Configure the SMTP transporter
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

// Function to send registration OTP email
const sendRegistrationOtp = (email, username, otp) => {
  const mailOptions = {
    from: 'eliteformals1@gmail.com',
    to: email,
    subject: 'Registration OTP for Elite Formal Store',
    text: `Dear ${username},

Thank you for registering with Elite Formal Store! We are excited to have you on board.

To complete your registration, please enter the following One-Time Password (OTP) on our website:

OTP: ${otp}

This OTP is valid for 10 minutes from the time of receipt. Please note that this OTP is confidential and should not be shared with anyone.

If you have any issues or concerns, please feel free to contact us at support@eliteformalstore.com.

Best regards,

Elite Formal Store Team

Disclaimer:

- This email and the OTP contained herein are confidential and intended solely for the use of the individual or entity to whom they are addressed.
- If you are not the intended recipient, please notify us immediately and delete this email from your system.
- Elite Formal Store shall not be liable for any damages or losses arising from the unauthorized use of this OTP.`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Error sending email:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
};

// Function to send forgot password OTP email
const sendForgotPasswordOtp = (email, username, otp) => {
  const mailOptions = {
    from: 'eliteformals1@gmail.com',
    to: email,
    subject: 'Forgot Password OTP for Elite Formal Store',
    text: `Dear ${username},

We received a request to reset your password for Elite Formal Store. To complete the password reset process, please enter the following One-Time Password (OTP) on our website:

OTP: ${otp}

This OTP is valid for 10 minutes from the time of receipt. Please note that this OTP is confidential and should not be shared with anyone.

If you have any issues or concerns, please feel free to contact us at support@eliteformalstore.com.

Best regards,

Elite Formal Store Team

Disclaimer:

- This email and the OTP contained herein are confidential and intended solely for the use of the individual or entity to whom they are addressed.
- If you are not the intended recipient, please notify us immediately and delete this email from your system.
- Elite Formal Store shall not be liable for any damages or losses arising from the unauthorized use of this OTP.
- Please note that resetting your password will log you out of all active sessions. If you are using a public computer, please ensure that you log out completely after resetting your password.`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Error sending email:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
};

module.exports = { transporter, sendRegistrationOtp, sendForgotPasswordOtp };
