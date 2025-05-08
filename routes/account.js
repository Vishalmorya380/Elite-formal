const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const bcrypt = require('bcryptjs');
const ensureAuthenticated = require('../middlewares/isAuthenticated');
const mongoose = require('mongoose');

router.get('/profile', ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      console.log('User not found in database for ID:', req.user._id);
      req.flash('error', 'User not found.');
      return res.redirect('/');
    }

    console.log('User fetched for profile:', {
      id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone
    });

    const userData = {
      ...user._doc,
      username: user.username || 'Not Set',
      email: user.email || 'Not Set',
      phone: user.phone || 'Not Set'
    };

    res.render('account/profile', {
      user: userData,
      success_msg: req.flash('success'),
      error_msg: req.flash('error')
    });
  } catch (error) {
    console.error('Error fetching user for profile:', error);
    req.flash('error', 'Error loading profile. Please try again.');
    res.redirect('/');
  }
});

router.post('/profile/update', ensureAuthenticated, async (req, res) => {
  try {
    const { username, email, phone } = req.body;

    // Validate all fields are provided
    if (!username || !email || !phone) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/account/profile');
    }

    // Validate phone format
    if (!/^\d{10}$/.test(phone)) {
      req.flash('error', 'Phone number must be exactly 10 digits.');
      return res.redirect('/account/profile');
    }

    // Validate username and email uniqueness
    const existingUsername = await User.findOne({ username, _id: { $ne: req.user._id } });
    if (existingUsername) {
      req.flash('error', 'Username already taken.');
      return res.redirect('/account/profile');
    }
    const existingEmail = await User.findOne({ email, _id: { $ne: req.user._id } });
    if (existingEmail) {
      req.flash('error', 'Email already registered.');
      return res.redirect('/account/profile');
    }

    await User.findByIdAndUpdate(req.user._id, { username, email, phone });
    req.flash('success', 'Profile updated successfully.');
    res.redirect('/account/profile');
  } catch (error) {
    console.error('Error updating profile:', error);
    req.flash('error', 'Error updating profile. Please try again.');
    res.redirect('/account/profile');
  }
});

router.post('/profile/change-password', ensureAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) {
      req.flash('error', 'New passwords do not match.');
      return res.redirect('/account/profile');
    }
    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      req.flash('error', 'Current password is incorrect.');
      return res.redirect('/account/profile');
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    req.flash('success', 'Password changed successfully.');
    res.redirect('/account/profile');
  } catch (error) {
    console.error('Error changing password:', error);
    req.flash('error', 'Error changing password. Please try again.');
    res.redirect('/account/profile');
  }
});

router.get('/orders', ensureAuthenticated, async (req, res) => {
  try {
    console.log('Fetching orders for user:', req.user._id);
    const orders = await Order.find({ user: req.user._id })
      .populate('products.product')
      .sort({ createdAt: -1 });

    console.log('Fetched orders:', orders);

    orders.forEach(order => {
      order.products = order.products.map(item => {
        if (!item.product) {
          console.warn(`Product not found for order ${order._id}, item:`, item);
          return { ...item, product: null };
        }
        return item;
      });
    });

    res.render('account/orders', {
      user: req.user,
      orders,
      success_msg: req.flash('success'),
      error_msg: req.flash('error')
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    req.flash('error', 'Error fetching orders. Please try again.');
    res.redirect('/account/orders');
  }
});

router.post('/orders/cancel/:orderId', ensureAuthenticated, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    console.log('Attempting to cancel order:', orderId);

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.log('Invalid order ID:', orderId);
      req.flash('error', 'Invalid order ID.');
      return res.redirect('/account/orders');
    }

    const order = await Order.findOne({ _id: orderId, user: req.user._id })
      .populate('products.product');
    if (!order) {
      console.log('Order not found or unauthorized for user:', req.user._id, 'Order ID:', orderId);
      req.flash('error', 'Order not found or unauthorized.');
      return res.redirect('/account/orders');
    }

    const cancellableStatuses = ['Pending', 'Processing'];
    if (!cancellableStatuses.includes(order.status)) {
      console.log(`Order cannot be cancelled (status: ${order.status}) for order:`, orderId);
      req.flash('error', `Order cannot be cancelled (status: ${order.status}).`);
      return res.redirect('/account/orders');
    }

    order.status = 'Cancelled';
    order.updatedAt = Date.now();
    await order.save();
    console.log('Order status updated to Cancelled for order:', orderId);

    for (const item of order.products) {
      if (item.product) {
        await Product.findByIdAndUpdate(item.product._id, {
          $inc: { stock: item.quantity }
        });
        console.log(`Restored stock for product ${item.product._id}: +${item.quantity}`);
      } else {
        console.warn(`Product not found for item in order ${orderId}, cannot restore stock:`, item);
      }
    }

    req.flash('success', 'Order cancelled successfully.');
    res.redirect('/account/orders');
  } catch (error) {
    console.error('Error cancelling order:', error);
    req.flash('error', 'Error cancelling order. Please try again.');
    res.redirect('/account/orders');
  }
});

router.get('/wishlist', ensureAuthenticated, (req, res) => {
  res.render('account/wishlist', { user: req.user, success_msg: req.flash('success'), error_msg: req.flash('error') });
});

router.get('/addresses', ensureAuthenticated, (req, res) => {
  res.render('account/addresses', { user: req.user, success_msg: req.flash('success'), error_msg: req.flash('error') });
});

router.get('/payment-methods', ensureAuthenticated, (req, res) => {
  res.render('account/payment-methods', { user: req.user, success_msg: req.flash('success'), error_msg: req.flash('error') });
});

router.get('/notifications', ensureAuthenticated, (req, res) => {
  res.render('account/notifications', { user: req.user, success_msg: req.flash('success'), error_msg: req.flash('error') });
});

router.get('/returns-refunds', ensureAuthenticated, (req, res) => {
  res.render('account/returns-refunds', { user: req.user, success_msg: req.flash('success'), error_msg: req.flash('error') });
});

module.exports = router;