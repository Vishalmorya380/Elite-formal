const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const nodemailer = require('nodemailer');

// Configure mail transporter
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Generate a 6-digit OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// User Registration route
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, phone } = req.body;

    // Validate inputs
    if (!username || !email || !password || !phone) {
      return res.render('register', { error: 'All fields are required.' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.render('register', { error: 'Please enter a valid email address.' });
    }

    // Validate phone format (10 digits)
    if (!/^\d{10}$/.test(phone)) {
      return res.render('register', { error: 'Phone number must be exactly 10 digits.' });
    }

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.render('register', { error: 'Username or email already exists.' });
    }

    const otp = generateOtp();

    // Store user data and OTP in session
    req.session.tempUser = { username, email, password, phone, otp };

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'OTP Verification',
      html: `<p>Thank you for registering! Please verify your email by entering the following OTP:</p>
             <p><b>${otp}</b></p>`
    };

    await transporter.sendMail(mailOptions);

    res.render('verifyOtp', { email, messages: {} });
  } catch (err) {
    console.error('Error during registration:', err);
    res.render('register', { error: 'Registration failed. Please try again.' });
  }
});

// Verify OTP route for registration
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  const tempUser = req.session.tempUser;

  if (!tempUser || tempUser.email !== email || tempUser.otp !== otp) {
    return res.render('verifyOtp', { email, messages: { error: 'Invalid OTP or OTP has expired. Please try again.' } });
  }

  // Hash the password once before saving to the database
  const hashedPassword = await bcrypt.hash(tempUser.password, 10);
  console.log(`Password during registration: ${tempUser.password}`);
  console.log(`Hashed password during registration: ${hashedPassword}`);

  const user = new User({
    username: tempUser.username,
    email: tempUser.email,
    password: hashedPassword,
    phone: tempUser.phone,
    isVerified: true
  });

  await user.save();
  console.log(`User registered with hashed password: ${hashedPassword}`);

  req.session.tempUser = null;

  res.render('login', { success: 'Registration successful! Please log in.', messages: {} });
});

// User Login route
router.get('/login', (req, res) => {
  res.render('login', { messages: { error: req.flash('error') } });
});

router.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/auth/login',
  failureFlash: true
}));

// User Logout route
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Error during logout:', err);
      return res.redirect('/');
    }
    res.redirect('/');
  });
});

// Forgot Password route
router.get('/forgot-password', (req, res) => {
  res.render('forgotPassword', { messages: { error: req.flash('error') } });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    req.flash('error', 'No account with that email address exists.');
    return res.redirect('/auth/forgot-password');
  }

  const otp = generateOtp();
  user.resetPasswordOtp = otp;
  user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
  await user.save();

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset OTP',
    html: `<p>You are receiving this because you (or someone else) have requested the reset of the password for your account.</p>
           <p>Your OTP for resetting the password is: <b>${otp}</b></p>
           <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>`
  };

  await transporter.sendMail(mailOptions);

  req.flash('error', 'An OTP has been sent to ' + email + ' with further instructions.');
  res.render('verifyOtpReset', { email, messages: { error: req.flash('error') } });
});

// Verify OTP route for password reset
router.post('/verify-otp-reset', async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email, resetPasswordOtp: otp, resetPasswordExpires: { $gt: Date.now() } });
  if (!user) {
    req.flash('error', 'OTP is invalid or has expired.');
    return res.render('verifyOtpReset', { email, messages: { error: req.flash('error') } });
  }

  res.render('resetPassword', { email, messages: {} });
});

// Reset Password route
router.post('/reset-password', async (req, res) => {
  const { email, password, confirmPassword } = req.body;
  const user = await User.findOne({ email, resetPasswordExpires: { $gt: Date.now() } });
  if (!user) {
    req.flash('error', 'Password reset token is invalid or has expired.');
    return res.render('resetPassword', { email, messages: { error: req.flash('error') } });
  }

  if (password !== confirmPassword) {
    req.flash('error', 'Passwords do not match.');
    return res.render('resetPassword', { email, messages: { error: req.flash('error') } });
  }

  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordOtp = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  req.flash('success', 'Success! Your password has been changed.');
  res.redirect('/auth/login');
});

module.exports = router;