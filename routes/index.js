const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// Index route (Homepage)
router.get('/', async (req, res) => {
  try {
    // Fetch new arrivals (last 30 days, no discounted items, limit to 4)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newArrivals = await Product.find({
      createdAt: { $gte: thirtyDaysAgo },
      discountedPrice: { $exists: false },
    })
      .sort({ createdAt: -1 })
      .limit(4)
      .lean();

    // Fetch sale items (products with a positive discountedPrice, limit to 4)
    const saleItems = await Product.find({
      discountedPrice: { $exists: true, $ne: null, $gt: 0 },
    })
      .limit(4)
      .lean();

    res.render('index', {
      newArrivals,
      saleItems,
      user: req.user || null,
    });
  } catch (err) {
    console.error('Error fetching index page data:', err);
    res.render('index', {
      newArrivals: [],
      saleItems: [],
      user: req.user || null,
    });
  }
});

// About Us route
router.get('/about', (req, res) => {
  res.render('about');
});

// Add routes for policy pages
router.get('/shipping-policy', (req, res) => {
  res.render('policies/shippingPolicy');
});

router.get('/return-policy', (req, res) => {
  res.render('policies/returnPolicy');
});

router.get('/terms-of-service', (req, res) => {
  res.render('policies/termsOfService');
});

router.get('/refund-policy', (req, res) => {
  res.render('policies/refundPolicy');
});

module.exports = router;