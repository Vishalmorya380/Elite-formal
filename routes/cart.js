
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error', 'Please log in to access your cart.');
  res.redirect('/auth/login');
};

// Helper function to determine if a product is footwear based on its name or category
const isFootwear = (product) => {
  const footwearKeywords = ['shoes', 'sneakers', 'sandals', 'boots', 'footwear'];
  const name = product.name ? product.name.toLowerCase() : '';
  const category = product.category ? product.category.toLowerCase() : '';
  
  // Check if the category or name indicates footwear
  return category === 'footwear' || footwearKeywords.some(keyword => name.includes(keyword));
};

// Helper function to calculate taxes based on the chosen method
const calculateTaxes = async (cart, totalBeforeDiscount, discount) => {
  let totalGST = 0;
  const taxBreakdown = []; // Array to store tax details for each item

  // Choose the tax calculation method
  const taxMethod = 'customGST'; // Options: 'customGST', 'flatRate'

  if (taxMethod === 'customGST') {
    // Option 1: Indian GST rules specific to your website
    for (const item of cart) {
      const product = await Product.findById(item.productId);
      if (!product) {
        console.log(`Product not found for productId: ${item.productId}`);
        continue;
      }

      // Calculate the discounted price for this item (for tax calculation)
      const originalItemTotal = item.price * item.quantity;
      const itemDiscount = totalBeforeDiscount > 0 ? (originalItemTotal / totalBeforeDiscount) * discount : 0;
      const discountedItemTotal = originalItemTotal - itemDiscount;
      const discountedPricePerUnit = discountedItemTotal / item.quantity;

      // Log the original and discounted prices for debugging
      console.log(`\nItem: ${item.name}`);
      console.log(`Original Price per Pair: ₹${item.price}`);
      console.log(`Quantity: ${item.quantity}`);
      console.log(`Original Item Total: ₹${originalItemTotal.toFixed(2)}`);
      console.log(`Item Discount: ₹${itemDiscount.toFixed(2)}`);
      console.log(`Discounted Item Total: ₹${discountedItemTotal.toFixed(2)}`);
      console.log(`Discounted Price per Unit: ₹${discountedPricePerUnit.toFixed(2)}`);

      // Determine if the product is footwear
      const category = isFootwear(product) ? 'Footwear' : (product.category || 'men');
      
      // Determine GST rate based on the EFFECTIVE price per pair (item.price)
      let gstRate;
      if (category === 'Footwear') {
        // Footwear-specific GST rates
        if (item.price <= 1000) {
          gstRate = 0.12; // 12% if <= ₹1000
          console.log(`Price per pair (₹${item.price}) <= ₹1000, applying 12% GST`);
        } else {
          gstRate = 0.18; // 18% if > ₹1000
          console.log(`Price per pair (₹${item.price}) > ₹1000, applying 18% GST`);
        }
      } else {
        // Non-footwear (e.g., clothing) GST rates
        if (item.price <= 1000) {
          gstRate = 0.05; // 5% if <= ₹1000
          console.log(`Price per piece (₹${item.price}) <= ₹1000, applying 5% GST`);
        } else {
          gstRate = 0.12; // 12% if > ₹1000
          console.log(`Price per piece (₹${item.price}) > ₹1000, applying 12% GST`);
        }
      }

      // Log the category and GST rate for debugging
      console.log(`Category: ${category}`);
      console.log(`GST Rate: ${gstRate * 100}%`);

      // Calculate base price (excluding GST) and GST amount based on the discounted total
      const basePrice = discountedItemTotal / (1 + gstRate);
      const gstAmount = discountedItemTotal - basePrice;
      totalGST += gstAmount;

      // Log the tax calculation for debugging
      console.log(`Base Price (excluding GST): ₹${basePrice.toFixed(2)}`);
      console.log(`GST Amount: ₹${gstAmount.toFixed(2)}`);
      console.log(`Total GST so far: ₹${totalGST.toFixed(2)}`);

      // Add tax details to the breakdown
      taxBreakdown.push({
        productId: item.productId,
        name: item.name,
        size: item.size,
        quantity: item.quantity,
        originalPrice: item.originalPrice, // Use the stored original price
        discountedPrice: discountedItemTotal,
        gstRate: gstRate * 100, // Convert to percentage (e.g., 18%)
        gstAmount: gstAmount
      });
    }
  } else if (taxMethod === 'flatRate') {
    // Option 2: Flat tax rate for all products
    const flatTaxRate = 0.10; // 10% flat tax rate
    const totalAfterDiscount = totalBeforeDiscount - discount;
    totalGST = totalAfterDiscount * flatTaxRate;

    // Distribute the tax proportionally across items
    for (const item of cart) {
      const originalItemTotal = item.price * item.quantity;
      const itemDiscount = totalBeforeDiscount > 0 ? (originalItemTotal / totalBeforeDiscount) * discount : 0;
      const discountedItemTotal = originalItemTotal - itemDiscount;
      const itemTax = totalAfterDiscount > 0 ? (discountedItemTotal / totalAfterDiscount) * totalGST : 0;

      taxBreakdown.push({
        productId: item.productId,
        name: item.name,
        size: item.size,
        quantity: item.quantity,
        originalPrice: item.originalPrice,
        discountedPrice: discountedItemTotal,
        gstRate: flatTaxRate * 100, // 10%
        gstAmount: itemTax
      });
    }
  }

  console.log(`\nFinal Total GST: ₹${totalGST.toFixed(2)}`);
  return { totalGST, taxBreakdown };
};

// Get Cart
// Get Cart
router.get('/', isAuthenticated, async (req, res) => {
  try {
    let cart = req.user.cart || [];

    // Ensure all cart items have a size and originalPrice
    cart = await Promise.all(cart.map(async item => {
      // Fix missing size
      if (!item.size) {
        const product = await Product.findById(item.productId);
        if (product && product.size) {
          item.size = product.size; // Set the product's default size
        } else {
          return null; // Remove item if product not found or no size
        }
      }

      // Fix missing originalPrice
      if (!item.hasOwnProperty('originalPrice')) {
        const product = await Product.findById(item.productId);
        if (product) {
          item.originalPrice = product.price; // Set the original price from the product
        } else {
          return null; // Remove item if product not found
        }
      }

      return item;
    }));

    // Filter out null items (items that were removed)
    cart = cart.filter(item => item !== null);

    // Update the user's cart with the cleaned-up items
    req.user.cart = cart;
    await req.user.save();

    // Calculate total before discount (using effective price)
    let totalBeforeDiscount = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    let discount = 0;
    if (req.user.appliedCoupon) {
      const coupon = await Coupon.findById(req.user.appliedCoupon);
      if (coupon) { // Ensure the coupon exists
        if (coupon.discountType === 'percentage') {
          discount = (totalBeforeDiscount * coupon.discountValue) / 100;
        } else {
          discount = coupon.discountValue;
        }
      }
    }

    // Calculate total after discount
    let total = totalBeforeDiscount - discount;

    // Calculate taxes using the custom function
    let totalGST = 0;
    let taxBreakdown = [];
    if (cart.length > 0) {
      const taxResult = await calculateTaxes(cart, totalBeforeDiscount, discount);
      totalGST = taxResult.totalGST;
      taxBreakdown = taxResult.taxBreakdown;
    }

    // Add total to taxBreakdown for display in cart.ejs
    total += totalGST; // Add GST to final total

    res.render('cart', {
      cart,
      total,
      discount,
      totalGST,
      taxBreakdown,
      user: req.user,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (err) {
    console.error('Error fetching cart:', err);
    req.flash('error', 'Failed to load cart.');
    res.redirect('/products');
  }
});

// Add to Cart
router.post('/add/:id', isAuthenticated, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect('/products');
    }

    const { size, quantity = 1 } = req.body; // Capture size and quantity from the form

    // Validate size
    if (!size) {
      req.flash('error', 'Please select a size.');
      return res.redirect(`/products/${req.params.id}`);
    }

    // Check if size exists in stockDetails or product.size
    const availableSizes = [...new Set(product.stockDetails.map(detail => detail.size).filter(s => s))];
    const validSize = availableSizes.includes(size) || product.size === size;
    if (!validSize) {
      req.flash('error', 'Invalid size selected.');
      return res.redirect(`/products/${req.params.id}`);
    }

    // Check stock availability for the selected size
    let stockAvailable = false;
    if (availableSizes.includes(size)) {
      const stockDetail = product.stockDetails.find(detail => detail.size === size);
      stockAvailable = stockDetail && stockDetail.stock >= quantity;
    } else if (product.size === size) {
      stockAvailable = product.stock >= quantity;
    }

    if (!stockAvailable) {
      req.flash('error', 'Selected size is out of stock or insufficient stock.');
      return res.redirect(`/products/${req.params.id}`);
    }

    // Calculate the effective price (sale price if discounted, otherwise original price)
    const effectivePrice = product.discountedPrice && product.discountedPrice > 0
      ? (product.price - product.discountedPrice)
      : product.price;

    const cart = req.user.cart || [];
    const existingItem = cart.find(
      item => item.productId.equals(product._id) && item.size === size
    );

    if (existingItem) {
      existingItem.quantity += parseInt(quantity);
      existingItem.price = effectivePrice; // Update price in case discount changed
      existingItem.originalPrice = product.price; // Update original price
    } else {
      cart.push({
        productId: product._id,
        name: product.name,
        price: effectivePrice, // Sale price or original price
        originalPrice: product.price, // Always store the original price
        image: product.image || '/images/placeholder.jpg',
        quantity: parseInt(quantity),
        size: size
      });
    }

    req.user.cart = cart;
    await req.user.save();

    req.flash('success', 'Product added to cart successfully.');
    if (req.query.buyNow) {
      return res.redirect('/checkout');
    }
    res.redirect('/cart');
  } catch (err) {
    console.error('Error adding to cart:', err);
    req.flash('error', 'Failed to add product to cart.');
    res.redirect('/products');
  }
});

// Handle "Buy Now" action
router.post('/buy-now/:id', isAuthenticated, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect('/products');
    }

    const { size, quantity = 1 } = req.body;

    // Validate size
    if (!size) {
      req.flash('error', 'Please select a size.');
      return res.redirect(`/products/${req.params.id}`);
    }

    // Check if size exists in stockDetails or product.size
    const availableSizes = [...new Set(product.stockDetails.map(detail => detail.size).filter(s => s))];
    const validSize = availableSizes.includes(size) || product.size === size;
    if (!validSize) {
      req.flash('error', 'Invalid size selected.');
      return res.redirect(`/products/${req.params.id}`);
    }

    // Check stock availability for the selected size
    let stockAvailable = false;
    if (availableSizes.includes(size)) {
      const stockDetail = product.stockDetails.find(detail => detail.size === size);
      stockAvailable = stockDetail && stockDetail.stock >= quantity;
    } else if (product.size === size) {
      stockAvailable = product.stock >= quantity;
    }

    if (!stockAvailable) {
      req.flash('error', 'Selected size is out of stock or insufficient stock.');
      return res.redirect(`/products/${req.params.id}`);
    }

    // Calculate the effective price (sale price if discounted, otherwise original price)
    const effectivePrice = product.discountedPrice && product.discountedPrice > 0
      ? (product.price - product.discountedPrice)
      : product.price;

    const item = {
      productId: product._id,
      name: product.name,
      price: effectivePrice, // Sale price or original price
      originalPrice: product.price, // Always store the original price
      image: product.image || '/images/placeholder.jpg',
      quantity: parseInt(quantity),
      size: size
    };

    req.user.cart = [item];
    await req.user.save();

    res.redirect('/checkout');
  } catch (err) {
    console.error('Error in buy-now:', err);
    req.flash('error', 'Failed to proceed to checkout.');
    res.redirect('/products');
  }
});

// Apply Coupon
router.post('/apply-coupon', isAuthenticated, async (req, res) => {
  const { code } = req.body;
  const coupon = await Coupon.findOne({ code });
  if (!coupon || new Date() > coupon.expirationDate) {
    req.flash('error', 'Invalid or expired coupon.');
    return res.redirect('/cart');
  }
  req.user.appliedCoupon = coupon._id;
  await req.user.save();
  req.flash('success', 'Coupon applied successfully.');
  res.redirect('/cart');
});

// Remove Coupon
router.post('/remove-coupon', isAuthenticated, async (req, res) => {
  req.user.appliedCoupon = null;
  await req.user.save();
  req.flash('success', 'Coupon removed successfully.');
  res.redirect('/cart');
});

// Remove from Cart
router.post('/remove/:id', isAuthenticated, async (req, res) => {
  const { size } = req.body; // Capture size from the form
  req.user.cart = req.user.cart.filter(
    item => !(item.productId.equals(req.params.id) && item.size === size)
  );
  await req.user.save();
  req.flash('success', 'Item removed from cart.');
  res.redirect('/cart');
});

// Increment Quantity
router.post('/increment/:id', isAuthenticated, async (req, res) => {
  const { size } = req.body; // Capture size from the form
  console.log('Incrementing quantity for:', { productId: req.params.id, size });

  const item = req.user.cart.find(
    item => item.productId.equals(req.params.id) && item.size === size
  );
  if (!item) {
    console.log('Item not found in cart:', { productId: req.params.id, size });
    req.flash('error', 'Item not found in cart.');
    return res.redirect('/cart');
  }

  console.log('Found item:', item);

  // Check stock availability
  const product = await Product.findById(req.params.id);
  if (!product) {
    console.log('Product not found:', req.params.id);
    req.flash('error', 'Product not found.');
    return res.redirect('/cart');
  }

  let stockAvailable = false;
  const availableSizes = [...new Set(product.stockDetails.map(detail => detail.size).filter(s => s))];
  if (availableSizes.includes(size)) {
    const stockDetail = product.stockDetails.find(detail => detail.size === size);
    stockAvailable = stockDetail && stockDetail.stock >= (item.quantity + 1);
    console.log('Stock check for size:', size, 'Stock available:', stockAvailable, 'Stock detail:', stockDetail, 'Required quantity:', item.quantity + 1);
  } else if (product.size === size) {
    stockAvailable = product.stock >= (item.quantity + 1);
    console.log('Stock check for product size:', size, 'Stock available:', stockAvailable, 'Product stock:', product.stock, 'Required quantity:', item.quantity + 1);
  }

  if (!stockAvailable) {
    console.log('Insufficient stock for size:', size);
    req.flash('error', 'Insufficient stock for the selected size.');
    return res.redirect('/cart');
  }

  // Recalculate the effective price in case the product's discount changed
  const effectivePrice = product.discountedPrice && product.discountedPrice > 0
    ? (product.price - product.discountedPrice)
    : product.price;

  item.quantity += 1;
  item.price = effectivePrice; // Update price in case discount changed
  item.originalPrice = product.price; // Update original price
  console.log('Updated item quantity:', item);

  await req.user.save();
  console.log('Cart saved to user:', req.user.cart);

  req.flash('success', 'Quantity updated.');
  res.redirect('/cart');
});

// Decrement Quantity
router.post('/decrement/:id', isAuthenticated, async (req, res) => {
  const { size } = req.body; // Capture size from the form
  const item = req.user.cart.find(
    item => item.productId.equals(req.params.id) && item.size === size
  );
  if (item) {
    // Recalculate the effective price in case the product's discount changed
    const product = await Product.findById(req.params.id);
    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect('/cart');
    }

    const effectivePrice = product.discountedPrice && product.discountedPrice > 0
      ? (product.price - product.discountedPrice)
      : product.price;

    if (item.quantity > 1) {
      item.quantity -= 1;
      item.price = effectivePrice; // Update price
      item.originalPrice = product.price; // Update original price
    } else {
      req.user.cart = req.user.cart.filter(
        item => !(item.productId.equals(req.params.id) && item.size === size)
      );
    }
    await req.user.save();
    req.flash('success', 'Quantity updated.');
  } else {
    req.flash('error', 'Item not found in cart.');
  }
  res.redirect('/cart');
});

// Clear Cart (Optional: Added for testing/debugging)
router.get('/clear', isAuthenticated, async (req, res) => {
  req.user.cart = [];
  await req.user.save();
  req.flash('success', 'Cart cleared.');
  res.redirect('/cart');
});

module.exports = router;
