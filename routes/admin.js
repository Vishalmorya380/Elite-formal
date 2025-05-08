const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  res.redirect('/admin/login');
};

// Define allowed size values
const upperBodySizes = ['S', 'M', 'L', 'XL', 'XXL'];
const menLowerBodySizes = ['28', '30', '32', '34', '36', '38', '40', '42', '44', '48'];
const womenLowerBodySizes = ['26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '48'];
const kidsLowerBodySizes = ['26', '28', '30', '32', '34'];
const menShoeSizes = Array.from({ length: 7 }, (_, i) => `UK ${i + 5}`); // UK 5 to UK 11
const womenShoeSizes = Array.from({ length: 7 }, (_, i) => `UK ${i + 4}`); // UK 4 to UK 10
const kidsShoeSizes = Array.from({ length: 8 }, (_, i) => `UK ${i + 1}`); // UK 1 to UK 8

const upperBodySubcategories = ['shirts', 'tshirts', 'jackets', 'kurti', 'dresses', 'suits'];
const lowerBodySubcategories = ['pants', 'plazo'];

// Validate size based on category and subcategory
const validateSize = (size, category, subcategory) => {
  if (!size) return true; // Size is optional
  if (upperBodySubcategories.includes(subcategory)) {
    return upperBodySizes.includes(size);
  } else if (lowerBodySubcategories.includes(subcategory)) {
    if (category === 'men') return menLowerBodySizes.includes(size);
    if (category === 'women') return womenLowerBodySizes.includes(size);
    if (category === 'kids') return kidsLowerBodySizes.includes(size);
  } else if (subcategory === 'shoes') {
    if (category === 'men') return menShoeSizes.includes(size);
    if (category === 'women') return womenShoeSizes.includes(size);
    if (category === 'kids') return kidsShoeSizes.includes(size);
  }
  return true; // No size validation for other subcategories (e.g., accessories)
};

// Function to update product.size based on stockDetails
const updateProductSizeFromStockDetails = (product) => {
  if (product.stockDetails && product.stockDetails.length > 0) {
    // Find the first size in stockDetails with stock > 0
    const firstAvailableSize = product.stockDetails.find(detail => detail.size && detail.stock > 0)?.size;
    // If no size with stock > 0, take the first size in stockDetails
    const firstSize = firstAvailableSize || product.stockDetails.find(detail => detail.size)?.size;
    product.size = firstSize || product.size; // Update size, or keep existing if no sizes in stockDetails
  } else {
    product.size = product.size || undefined; // Keep existing size if stockDetails is empty
  }
  return product;
};

// Admin Login Route
router.get('/login', (req, res) => {
  res.render('adminLogin', { error: req.flash('error') });
});

router.post('/login', passport.authenticate('local', {
  successRedirect: '/admin/dashboard',
  failureRedirect: '/admin/login',
  failureFlash: true
}));

// Admin Dashboard Route
router.get('/dashboard', isAdmin, (req, res) => {
  res.render('admin/adminDashboard', { user: req.user });
});

// Admin Registration Route
router.get('/register', (req, res) => {
  res.render('adminRegister', { messages: {} });
});

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, phone, adminCode } = req.body;

    // Log the incoming request body to debug
    console.log('Request body:', req.body);

    // Validate required fields
    if (!username || !email || !password || !phone || !adminCode) {
      return res.render('adminRegister', { messages: { error: 'All fields are required.' } });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.render('adminRegister', { messages: { error: 'Please enter a valid email address.' } });
    }

    // Validate phone format (10 digits)
    if (!/^\d{10}$/.test(phone)) {
      return res.render('adminRegister', { messages: { error: 'Phone number must be exactly 10 digits.' } });
    }

    // Validate password
    // const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{10,}$/;
    // if (!passwordRegex.test(password)) {
    //   return res.render('adminRegister', { messages: { error: 'Password must be at least 10 characters long, contain one special character, one uppercase letter, one lowercase letter, and one numeric digit.' } });
    // }

    // Validate admin code
    const validAdminCode = process.env.ADMIN_CODE;
    if (!validAdminCode) {
      console.error('ADMIN_CODE is not defined in environment variables.');
      return res.render('adminRegister', { messages: { error: 'Server configuration error. Please contact support.' } });
    }
    if (adminCode !== validAdminCode) {
      return res.render('adminRegister', { messages: { error: 'Invalid admin code.' } });
    }

    // Check for existing user
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.render('adminRegister', { messages: { error: 'Username or email already exists.' } });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const user = new User({
      username,
      email,
      password: hashedPassword,
      phone,
      isVerified: true,
      role: 'admin'
    });
    await user.save();
    res.render('adminRegister', { messages: { success: 'Admin registration successful. You can now log in.' } });
  } catch (err) {
    console.error('Error registering admin:', err);
    res.render('adminRegister', { messages: { error: 'Registration failed. Please try again.' } });
  }
});

// Admin Forgot Password Route
router.get('/forgot-password', (req, res) => {
  res.render('adminForgotPassword', { error: req.flash('error') });
});

router.post('/forgot-password', (req, res) => {
  const { adminCode, newPassword, confirmPassword } = req.body;
  const validAdminCode = process.env.ADMIN_CODE;

  if (!validAdminCode) {
    console.error('ADMIN_CODE is not defined in environment variables.');
    req.flash('error', 'Server configuration error. Please contact support.');
    return res.redirect('/admin/forgot-password');
  }

  if (adminCode !== validAdminCode) {
    req.flash('error', 'Invalid admin code');
    return res.redirect('/admin/forgot-password');
  }
  if (newPassword !== confirmPassword) {
    req.flash('error', 'Passwords do not match');
    return res.redirect('/admin/forgot-password');
  }
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  User.updateOne({ role: 'admin' }, { password: hashedPassword }, (err) => {
    if (err) {
      req.flash('error', 'Failed to reset password');
      return res.redirect('/admin/forgot-password');
    }
    req.flash('success', 'Password changed successfully');
    res.redirect('/admin/login');
  });
});

// Admin Logout Route
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Error logging out:', err);
      return res.redirect('/admin/login');
    }
    res.redirect('/admin/login');
  });
});

// Manage Products
router.get('/products', isAdmin, async (req, res) => {
  try {
    const { category, subcategory, special } = req.query;
    let query = {};
    if (category) query.category = { $regex: new RegExp(`^${category}$`, 'i') };
    if (subcategory) query.subcategory = { $regex: new RegExp(`^${subcategory}$`, 'i') };

    let products;
    if (special === 'new_arrivals') {
      query.discountedPrice = { $exists: false };
      query.createdAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }; // Last 7 days
      products = await Product.find(query).sort({ createdAt: -1 });
    } else if (special === 'sale') {
      query.discountedPrice = { $exists: true, $ne: null, $gt: 0 };
      products = await Product.find(query);
    } else {
      products = await Product.find(query);
    }
    res.render('admin/manageProducts', {
      products,
      user: req.user,
      category,
      subcategory,
      special,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    req.flash('error', 'Failed to load products.');
    res.redirect('/admin/dashboard');
  }
});

router.post('/products/add', isAdmin, async (req, res) => {
  try {
    const { name, description, price, discountedPrice, category, subcategory, color, image, size, stock, stockDetails } = req.body;

    // Validate required fields
    if (!name || !description || !price || !category || !subcategory || !color || !image || stock === undefined) {
      req.flash('error', 'All required fields must be filled.');
      return res.redirect('/admin/products');
    }

    // Validate numeric fields
    if (price < 0 || stock < 0 || (discountedPrice && discountedPrice < 0)) {
      req.flash('error', 'Price, discounted price, and stock must be non-negative.');
      return res.redirect('/admin/products');
    }

    // Validate size
    if (size && !validateSize(size, category, subcategory)) {
      req.flash('error', 'Invalid size for the selected category and subcategory.');
      return res.redirect('/admin/products');
    }

    // Validate stockDetails sizes
    const stockDetailsArray = stockDetails ? (Array.isArray(stockDetails) ? stockDetails : [stockDetails]) : [];
    for (const detail of stockDetailsArray) {
      if (detail.size && !validateSize(detail.size, category, subcategory)) {
        req.flash('error', 'Invalid size in stock details.');
        return res.redirect('/admin/products');
      }
      if (detail.stock < 0) {
        req.flash('error', 'Stock quantity in stock details must be non-negative.');
        return res.redirect('/admin/products');
      }
    }

    // Check for existing product
    const existingProduct = await Product.findOne({ name, subcategory });
    if (existingProduct) {
      req.flash('error', 'A product with the same name and subcategory already exists.');
      return res.redirect('/admin/products');
    }

    // Create the product
    const product = new Product({
      name,
      description,
      price: Number(price),
      discountedPrice: discountedPrice ? Number(discountedPrice) : undefined,
      category,
      subcategory,
      color,
      image,
      size: size || undefined,
      stock: Number(stock),
      stockDetails: stockDetailsArray.map(detail => ({
        color: detail.color || undefined,
        size: detail.size || undefined,
        stock: Number(detail.stock) || 0
      }))
    });

    // Update product.size based on stockDetails
    updateProductSizeFromStockDetails(product);

    await product.save();
    req.flash('success', 'Product added successfully.');
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Error adding product:', err);
    req.flash('error', 'Failed to add product.');
    res.redirect('/admin/products');
  }
});

router.get('/products/edit/:id', isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect('/admin/products');
    }
    res.render('admin/editProduct', {
      product,
      user: req.user,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (err) {
    console.error('Error fetching product for edit:', err);
    req.flash('error', 'Failed to load product.');
    res.redirect('/admin/products');
  }
});

router.post('/products/edit/:id', isAdmin, async (req, res) => {
  try {
    const { name, description, price, discountedPrice, category, subcategory, color, image, size, stock, stockDetails } = req.body;

    // Validate required fields
    if (!name || !description || !price || !category || !subcategory || !color || !image || stock === undefined) {
      req.flash('error', 'All required fields must be filled.');
      return res.redirect(`/admin/products/edit/${req.params.id}`);
    }

    // Validate numeric fields
    if (price < 0 || stock < 0 || (discountedPrice && discountedPrice < 0)) {
      req.flash('error', 'Price, discounted price, and stock must be non-negative.');
      return res.redirect(`/admin/products/edit/${req.params.id}`);
    }

    // Validate size
    if (size && !validateSize(size, category, subcategory)) {
      req.flash('error', 'Invalid size for the selected category and subcategory.');
      return res.redirect(`/admin/products/edit/${req.params.id}`);
    }

    // Validate stockDetails sizes
    const stockDetailsArray = stockDetails ? (Array.isArray(stockDetails) ? stockDetails : [stockDetails]) : [];
    for (const detail of stockDetailsArray) {
      if (detail.size && !validateSize(detail.size, category, subcategory)) {
        req.flash('error', 'Invalid size in stock details.');
        return res.redirect(`/admin/products/edit/${req.params.id}`);
      }
      if (detail.stock < 0) {
        req.flash('error', 'Stock quantity in stock details must be non-negative.');
        return res.redirect(`/admin/products/edit/${req.params.id}`);
      }
    }

    // Check for existing product with same name and subcategory
    const existingProduct = await Product.findOne({ name, subcategory, _id: { $ne: req.params.id } });
    if (existingProduct) {
      req.flash('error', 'A product with the same name and subcategory already exists.');
      return res.redirect(`/admin/products/edit/${req.params.id}`);
    }

    // Update the product
    const product = await Product.findById(req.params.id);
    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect(`/admin/products/edit/${req.params.id}`);
    }

    product.name = name;
    product.description = description;
    product.price = Number(price);
    product.discountedPrice = discountedPrice ? Number(discountedPrice) : undefined;
    product.category = category;
    product.subcategory = subcategory;
    product.color = color;
    product.image = image;
    product.size = size || undefined;
    product.stock = Number(stock);
    product.stockDetails = stockDetailsArray.map(detail => ({
      color: detail.color || undefined,
      size: detail.size || undefined,
      stock: Number(detail.stock) || 0
    }));
    product.updatedAt = Date.now();

    // Update product.size based on stockDetails (override the form's size if stockDetails has sizes)
    updateProductSizeFromStockDetails(product);

    await product.save();

    req.flash('success', 'Product updated successfully.');
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Error updating product:', err);
    req.flash('error', 'Failed to update product.');
    res.redirect(`/admin/products/edit/${req.params.id}`);
  }
});

router.post('/products/delete/:id', isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    req.flash('success', 'Product deleted successfully.');
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Error deleting product:', err);
    req.flash('error', 'Failed to delete product.');
    res.redirect('/admin/products');
  }
});

// Stock Management
router.get('/stock-management', isAdmin, async (req, res) => {
  try {
    const { category, subcategory, special } = req.query;
    let query = {};
    if (category) query.category = { $regex: new RegExp(`^${category}$`, 'i') };
    if (subcategory) query.subcategory = { $regex: new RegExp(`^${subcategory}$`, 'i') };

    let products;
    if (special === 'new_arrivals') {
      query.discountedPrice = { $exists: false };
      query.createdAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
      products = await Product.find(query).sort({ createdAt: -1 });
    } else if (special === 'sale') {
      query.discountedPrice = { $exists: true, $ne: null, $gt: 0 };
      products = await Product.find(query);
    } else {
      products = await Product.find(query);
    }

    res.render('admin/manageStock', {
      products,
      user: req.user,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (err) {
    console.error('Error fetching products for stock management:', err);
    req.flash('error', 'Failed to load stock management.');
    res.redirect('/admin/dashboard');
  }
});

router.post('/stock-management', isAdmin, async (req, res) => {
  try {
    let { stockEntries } = req.body;
    if (!stockEntries || typeof stockEntries !== 'object') {
      req.flash('error', 'Invalid stock data received.');
      return res.redirect('/admin/stock-management');
    }

    stockEntries = Object.keys(stockEntries).map(key => stockEntries[key]);
    for (const entry of stockEntries) {
      if (!entry || !entry.productId) continue; // Skip if no productId

      const { productId, color, size, stockQuantity } = entry;

      if (!mongoose.Types.ObjectId.isValid(productId)) {
        req.flash('error', 'Invalid product ID.');
        return res.redirect('/admin/stock-management');
      }

      if (stockQuantity < 0) {
        req.flash('error', 'Stock quantity must be non-negative.');
        return res.redirect('/admin/stock-management');
      }

      const product = await Product.findById(productId);
      if (!product) {
        req.flash('error', 'Product not found.');
        return res.redirect('/admin/stock-management');
      }

      // Validate size
      if (size && !validateSize(size, product.category, product.subcategory)) {
        req.flash('error', 'Invalid size for the selected product.');
        return res.redirect('/admin/stock-management');
      }

      // Check for existing stock detail with the same color and size
      const existingDetailIndex = product.stockDetails.findIndex(
        detail => detail.color === color && detail.size === size
      );

      if (existingDetailIndex !== -1) {
        // Update existing stock detail
        product.stockDetails[existingDetailIndex].stock = parseInt(stockQuantity);
      } else {
        // Add new stock detail
        product.stockDetails.push({
          color: color || undefined,
          size: detail.size || undefined,
          stock: parseInt(stockQuantity)
        });
      }

      // Recalculate total stock
      product.stock = product.stockDetails.reduce((total, detail) => total + detail.stock, 0);

      // Update product.size based on stockDetails
      updateProductSizeFromStockDetails(product);

      await product.save();
    }

    req.flash('success', 'Stock updated successfully.');
    res.redirect('/admin/stock-management');
  } catch (err) {
    console.error('Error updating stock:', err);
    req.flash('error', 'Failed to update stock.');
    res.redirect('/admin/stock-management');
  }
});

router.post('/stock-management/update', isAdmin, async (req, res) => {
  try {
    const { productId, detailIndex, color, size, stockQuantity } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      req.flash('error', 'Invalid product ID.');
      return res.redirect('/admin/stock-management');
    }

    if (stockQuantity < 0) {
      req.flash('error', 'Stock quantity must be non-negative.');
      return res.redirect('/admin/stock-management');
    }

    const product = await Product.findById(productId);
    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect('/admin/stock-management');
    }

    if (detailIndex < 0 || detailIndex >= product.stockDetails.length) {
      req.flash('error', 'Invalid stock detail index.');
      return res.redirect('/admin/stock-management');
    }

    // Validate size
    if (size && !validateSize(size, product.category, product.subcategory)) {
      req.flash('error', 'Invalid size for the selected product.');
      return res.redirect('/admin/stock-management');
    }

    // Update the specific stock detail
    product.stockDetails[detailIndex] = {
      color: color || undefined,
      size: size || undefined,
      stock: parseInt(stockQuantity)
    };

    // Recalculate total stock
    product.stock = product.stockDetails.reduce((total, detail) => total + detail.stock, 0);

    // Update product.size based on stockDetails
    updateProductSizeFromStockDetails(product);

    await product.save();

    req.flash('success', 'Stock detail updated successfully.');
    res.redirect('/admin/stock-management');
  } catch (err) {
    console.error('Error updating stock detail:', err);
    req.flash('error', 'Failed to update stock detail.');
    res.redirect('/admin/stock-management');
  }
});

router.post('/stock-management/delete', isAdmin, async (req, res) => {
  try {
    const { productId, detailIndex } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      req.flash('error', 'Invalid product ID.');
      return res.redirect('/admin/stock-management');
    }

    const product = await Product.findById(productId);
    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect('/admin/stock-management');
    }

    if (detailIndex < 0 || detailIndex >= product.stockDetails.length) {
      req.flash('error', 'Invalid stock detail index.');
      return res.redirect('/admin/stock-management');
    }

    // Remove the stock detail
    product.stockDetails.splice(detailIndex, 1);

    // Recalculate total stock
    product.stock = product.stockDetails.reduce((total, detail) => total + detail.stock, 0);

    // Update product.size based on stockDetails
    updateProductSizeFromStockDetails(product);

    await product.save();

    req.flash('success', 'Stock detail deleted successfully.');
    res.redirect('/admin/stock-management');
  } catch (err) {
    console.error('Error deleting stock detail:', err);
    req.flash('error', 'Failed to delete stock detail.');
    res.redirect('/admin/stock-management');
  }
});

// Manage Coupons
router.get('/coupons', isAdmin, async (req, res) => {
  try {
    const coupons = await Coupon.find();
    res.render('admin/manageCoupons', {
      coupons,
      user: req.user,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (err) {
    console.error('Error fetching coupons:', err);
    req.flash('error', 'Failed to load coupons.');
    res.redirect('/admin/dashboard');
  }
});

router.post('/coupons/add', isAdmin, async (req, res) => {
  try {
    const { code, discountType, discountValue, expirationDate } = req.body;
    const coupon = new Coupon({ code, discountType, discountValue, expirationDate });
    await coupon.save();
    req.flash('success', 'Coupon added successfully.');
    res.redirect('/admin/coupons');
  } catch (err) {
    console.error('Error adding coupon:', err);
    req.flash('error', 'Failed to add coupon.');
    res.redirect('/admin/coupons');
  }
});

router.post('/coupons/edit/:id', isAdmin, async (req, res) => {
  try {
    const { code, discountType, discountValue, expirationDate } = req.body;
    await Coupon.findByIdAndUpdate(req.params.id, { code, discountType, discountValue, expirationDate });
    req.flash('success', 'Coupon updated successfully.');
    res.redirect('/admin/coupons');
  } catch (err) {
    console.error('Error updating coupon:', err);
    req.flash('error', 'Failed to update coupon.');
    res.redirect('/admin/coupons');
  }
});

router.post('/coupons/delete/:id', isAdmin, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    req.flash('success', 'Coupon deleted successfully.');
    res.redirect('/admin/coupons');
  } catch (err) {
    console.error('Error deleting coupon:', err);
    req.flash('error', 'Failed to delete coupon.');
    res.redirect('/admin/coupons');
  }
});

// Manage Users
router.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find();
    res.render('admin/manageUsers', {
      users,
      user: req.user,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    req.flash('error', 'Failed to load users.');
    res.redirect('/admin/dashboard');
  }
});

router.post('/users/edit/:id', isAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    await User.findByIdAndUpdate(req.params.id, { role });
    req.flash('success', 'User role updated successfully.');
    res.redirect('/admin/users');
  } catch (err) {
    console.error('Error updating user:', err);
    req.flash('error', 'Failed to update user.');
    res.redirect('/admin/users');
  }
});

router.post('/users/delete/:id', isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    req.flash('success', 'User deleted successfully.');
    res.redirect('/admin/users');
  } catch (err) {
    console.error('Error deleting user:', err);
    req.flash('error', 'Failed to delete user.');
    res.redirect('/admin/users');
  }
});

// Manage Orders
router.get('/orders', isAdmin, async (req, res) => {
  try {
    const orders = await Order.find().populate('user');
    res.render('admin/manageOrders', {
      orders,
      user: req.user,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    req.flash('error', 'Failed to load orders.');
    res.redirect('/admin/dashboard');
  }
});

router.post('/orders/update/:id', isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Completed', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      req.flash('error', 'Invalid order status.');
      return res.redirect('/admin/orders');
    }
    await Order.findByIdAndUpdate(req.params.id, { status, updatedAt: Date.now() });
    req.flash('success', 'Order status updated successfully.');
    res.redirect('/admin/orders');
  } catch (err) {
    console.error('Error updating order:', err);
    req.flash('error', 'Failed to update order.');
    res.redirect('/admin/orders');
  }
});

// Analytics
router.get('/analytics', isAdmin, (req, res) => {
  res.render('admin/analytics', {
    user: req.user,
    success: req.flash('success'),
    error: req.flash('error')
  });
});

module.exports = router;