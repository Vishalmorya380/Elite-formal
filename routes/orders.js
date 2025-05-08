const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const { isAuthenticated } = require('../middleware/auth'); // Middleware to ensure user is logged in

// POST /orders/add - Create a new order (e.g., after checkout)
router.post('/add', isAuthenticated, async (req, res) => {
  try {
    const { items, totalAmount, discount, paymentMethod, shippingDetails } = req.body;

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      req.flash('error', 'No items in the order.');
      return res.redirect('/cart');
    }

    // Validate shipping details
    if (!shippingDetails || !shippingDetails.name || !shippingDetails.address || !shippingDetails.phone) {
      req.flash('error', 'Shipping details are incomplete.');
      return res.redirect('/checkout');
    }

    // Prepare the products array for the order
    const products = await Promise.all(
      items.map(async item => {
        const product = await Product.findById(item.productId);
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        // Check stock availability
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for product: ${product.name}`);
        }
        return {
          product: item.productId,
          name: product.name,
          price: product.discountedPrice || product.price,
          quantity: item.quantity,
          size: item.size
        };
      })
    );

    // Create the order
    const order = new Order({
      user: req.user._id,
      products,
      totalAmount,
      discount: discount || 0,
      shippingDetails,
      paymentMethod: paymentMethod || undefined // Let the model default to 'razorpay' if not provided
      // Note: We do NOT set the status here, letting the model's default ("Processing") take effect
    });

    // Save the order
    await order.save();

    // Update product stock
    for (const item of items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity }
      });
    }

    // Clear the user's cart (assuming cart is stored in session or database)
    req.session.cart = []; // Adjust this based on how your cart is implemented

    req.flash('success', 'Order placed successfully!');
    res.redirect('/orders');
  } catch (err) {
    console.error('Error creating order:', err);
    req.flash('error', err.message || 'Failed to place order. Please try again.');
    res.redirect('/checkout');
  }
});

// GET /orders - Display the user's orders
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate('products.product')
      .sort({ createdAt: -1 }); // Sort by most recent first
    res.render('orders/list', {
      orders,
      user: req.user,
      success_msg: req.flash('success'),
      error_msg: req.flash('error')
    });
  } catch (err) {
    console.error('Error fetching user orders:', err);
    req.flash('error', 'Failed to load your orders.');
    res.redirect('/');
  }
});

// GET /orders/:id - Display details of a specific order
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
      .populate('products.product');
    if (!order) {
      req.flash('error', 'Order not found.');
      return res.redirect('/orders');
    }
    res.render('orders/detail', {
      order,
      user: req.user,
      success_msg: req.flash('success'),
      error_msg: req.flash('error')
    });
  } catch (err) {
    console.error('Error fetching order details:', err);
    req.flash('error', 'Failed to load order details.');
    res.redirect('/orders');
  }
});

module.exports = router;