const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const Product = require('../models/Product');
const isAuthenticated = require('../middlewares/isAuthenticated');
const nodemailer = require('nodemailer');

// Setup nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Initialize Razorpay instance with your key_id and key_secret
const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Helper function to determine if a product is footwear
const isFootwear = (product) => {
  const footwearKeywords = ['shoes', 'sneakers', 'sandals', 'boots', 'footwear'];
  const name = product.name ? product.name.toLowerCase() : '';
  const category = product.category ? product.category.toLowerCase() : '';
  return category === 'footwear' || footwearKeywords.some(keyword => name.includes(keyword));
};

// Helper function to calculate taxes
const calculateTaxes = async (cart, totalBeforeDiscount, discount) => {
  let totalGST = 0;
  const taxBreakdown = [];

  for (const item of cart) {
    const product = await Product.findById(item.productId);
    if (!product) {
      console.log(`Product not found for productId: ${item.productId}`);
      continue;
    }

    const originalItemTotal = item.price * item.quantity;
    const itemDiscount = totalBeforeDiscount > 0 ? (originalItemTotal / totalBeforeDiscount) * discount : 0;
    const discountedItemTotal = originalItemTotal - itemDiscount;
    const discountedPricePerUnit = discountedItemTotal / item.quantity;

    const category = isFootwear(product) ? 'Footwear' : (product.category || 'men');
    let gstRate;
    if (category === 'Footwear') {
      gstRate = item.price <= 1000 ? 0.12 : 0.18;
    } else {
      gstRate = item.price <= 1000 ? 0.05 : 0.12;
    }

    const basePrice = discountedItemTotal / (1 + gstRate);
    const gstAmount = discountedItemTotal - basePrice;
    totalGST += gstAmount;

    taxBreakdown.push({
      productId: item.productId,
      name: item.name,
      size: item.size,
      quantity: item.quantity,
      originalPrice: item.originalPrice,
      discountedPrice: discountedItemTotal,
      gstRate: gstRate * 100,
      gstAmount: gstAmount
    });
  }

  return { totalGST, taxBreakdown };
};

// Checkout Page
router.get('/', isAuthenticated, async (req, res) => {
  try {
    let cart = req.user.cart || [];
    if (cart.length === 0) {
      req.flash('error', 'Your cart is empty.');
      return res.redirect('/cart');
    }

    // Ensure all cart items have a size; if not, fetch from product or remove the item
    cart = await Promise.all(cart.map(async item => {
      if (!item.size) {
        const product = await Product.findById(item.productId);
        if (product && product.size) {
          item.size = product.size;
          return item;
        } else {
          return null;
        }
      }
      return item;
    }));

    // Filter out null items
    cart = cart.filter(item => item !== null);

    // Update the user's cart
    req.user.cart = cart;
    await req.user.save();

    if (cart.length === 0) {
      req.flash('error', 'Your cart is empty after validation.');
      return res.redirect('/cart');
    }

    // Calculate total before discount and taxes
    let totalBeforeDiscount = parseFloat(cart.reduce((acc, item) => acc + item.price * item.quantity, 0).toFixed(2));
    let discount = 0;

    if (req.user.appliedCoupon) {
      const coupon = await Coupon.findById(req.user.appliedCoupon);
      if (coupon) {
        discount = coupon.discountType === 'percentage'
          ? (totalBeforeDiscount * coupon.discountValue) / 100
          : coupon.discountValue;
        discount = parseFloat(discount.toFixed(2));
      }
    }

    // Calculate total after discount
    let totalAfterDiscount = parseFloat((totalBeforeDiscount - discount).toFixed(2));

    // Calculate taxes
    let totalGST = 0;
    let taxBreakdown = [];
    if (cart.length > 0) {
      const taxResult = await calculateTaxes(cart, totalBeforeDiscount, discount);
      totalGST = parseFloat(taxResult.totalGST.toFixed(2));
      taxBreakdown = taxResult.taxBreakdown.map(breakdown => ({
        ...breakdown,
        discountedPrice: parseFloat(breakdown.discountedPrice.toFixed(2)),
        gstAmount: parseFloat(breakdown.gstAmount.toFixed(2))
      }));
    }

    // Add GST to the final total
    let total = parseFloat((totalAfterDiscount + totalGST).toFixed(2));

    res.render('checkout', {
      cart,
      totalBeforeDiscount,
      discount,
      totalAfterDiscount,
      totalGST,
      taxBreakdown,
      total,
      user: req.user,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (error) {
    console.error('Error in checkout:', error);
    req.flash('error', 'Something went wrong.');
    res.redirect('/cart');
  }
});

// Place Order
router.post('/place-order', isAuthenticated, async (req, res) => {
  try {
    let { name, phone, address, city, state, zip, paymentMethod, total, cart } = req.body;

    if (!cart || cart.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    // Parse cart if it's a string (from hidden input)
    if (typeof cart === 'string') {
      try {
        cart = JSON.parse(cart);
      } catch (error) {
        console.error('Error parsing cart:', error);
        return res.status(400).json({ error: 'Invalid cart data.' });
      }
    }

    // Validate cart structure
    const requiredCartFields = ['productId', 'name', 'price', 'quantity', 'size', 'image'];
    const invalidCartItems = cart.filter(item => 
      !requiredCartFields.every(field => field in item && item[field] !== undefined && item[field] !== null)
    );
    if (invalidCartItems.length > 0) {
      console.error('Invalid cart items:', invalidCartItems);
      return res.status(400).json({ error: 'Invalid cart data: missing required fields.' });
    }

    // Log the incoming form data for debugging
    console.log('Form Data Received:', req.body);

    // Server-side validation for shipping details
    const shippingDetails = { name, phone, address, city, state, zip };
    const requiredFields = ['name', 'phone', 'address', 'city', 'state', 'zip'];

    // Check for missing or empty fields
    const missingFields = requiredFields.filter(field => {
      const value = shippingDetails[field];
      return !value || (typeof value === 'string' && value.trim() === '');
    });

    if (missingFields.length > 0) {
      console.log('Missing or Empty Fields:', missingFields);
      return res.status(400).json({ error: `Missing or empty required fields: ${missingFields.join(', ')}` });
    }

    // Additional validations
    // Name: 5-30 characters, letters and spaces only
    const nameRegex = /^[A-Za-z\s]{5,30}$/;
    if (!nameRegex.test(name)) {
      return res.status(400).json({ error: 'Enter proper name (5-30 characters, letters and spaces only)' });
    }

    // Phone: 10-digit integer
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ error: 'Enter proper phone number (exactly 10 digits)' });
    }

    // Address: 10-100 characters, letters, numbers, spaces, and common punctuation
    const addressRegex = /^[A-Za-z0-9\s,.#-]{10,100}$/;
    if (!addressRegex.test(address)) {
      return res.status(400).json({ error: 'Enter proper address (10-100 characters, letters, numbers, spaces, commas, periods, #, or -)' });
    }

    // Zip: 6-digit integer (Indian PIN code)
    const zipRegex = /^\d{6}$/;
    if (!zipRegex.test(zip)) {
      return res.status(400).json({ error: 'Enter proper zip code (exactly 6 digits)' });
    }

    // Validate stock availability for each item in the cart
    for (const item of cart) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ error: `Product ${item.name} is no longer available.` });
      }

      let stockAvailable = false;
      const availableSizes = [...new Set(product.stockDetails.map(detail => detail.size).filter(s => s))];
      if (availableSizes.includes(item.size)) {
        const stockDetail = product.stockDetails.find(detail => detail.size === item.size);
        stockAvailable = stockDetail && stockDetail.stock >= item.quantity;
      } else if (product.size === item.size) {
        stockAvailable = product.stock >= item.quantity;
      }

      if (!stockAvailable) {
        return res.status(400).json({ error: `Insufficient stock for ${item.name} (Size: ${item.size}).` });
      }
    }

    // Recalculate total with taxes to ensure consistency
    let totalBeforeDiscount = parseFloat(cart.reduce((acc, item) => acc + item.price * item.quantity, 0).toFixed(2));
    let discount = 0;
    if (req.user.appliedCoupon) {
      const coupon = await Coupon.findById(req.user.appliedCoupon);
      if (coupon) {
        discount = coupon.discountType === 'percentage'
          ? (totalBeforeDiscount * coupon.discountValue) / 100
          : coupon.discountValue;
        discount = parseFloat(discount.toFixed(2));
      }
    }
    let totalAfterDiscount = parseFloat((totalBeforeDiscount - discount).toFixed(2));
    const taxResult = await calculateTaxes(cart, totalBeforeDiscount, discount);
    const totalGST = parseFloat(taxResult.totalGST.toFixed(2));
    const finalTotal = parseFloat((totalAfterDiscount + totalGST).toFixed(2));

    // Validate the total matches the client-side total
    if (parseFloat(total).toFixed(2) !== finalTotal.toFixed(2)) {
      console.error('Total mismatch:', { clientTotal: total, serverTotal: finalTotal });
      return res.status(400).json({ error: 'Total amount mismatch. Please refresh and try again.' });
    }

    // Create temporary order
    const temporaryOrder = {
      user: req.user._id,
      products: cart.map(item => ({
        product: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        size: item.size,
        image: item.image
      })),
      totalAmount: finalTotal,
      shippingDetails,
      paymentMethod,
      status: 'Processing',
    };

    console.log('Temporary Order Status (Before Razorpay/COD):', temporaryOrder.status);
    console.log('Temporary Order:', temporaryOrder);

    if (paymentMethod === 'razorpay') {
      // Create Razorpay order
      const options = {
        amount: Math.round(finalTotal * 100),
        currency: "INR",
        receipt: new mongoose.Types.ObjectId().toString(),
      };

      const razorpayOrder = await razorpayInstance.orders.create(options);

      if (!razorpayOrder) {
        return res.status(500).json({ error: 'Failed to create Razorpay order' });
      }

      // Return the Razorpay order ID and temporary order to the client
      return res.status(201).json({ razorpayOrderID: razorpayOrder.id, temporaryOrder });
    } else if (paymentMethod === 'cod') {
      // Save the order to the database
      let order;
      try {
        order = new Order(temporaryOrder);
        await order.save();
        console.log('Saved Order Status (COD):', order.status);
        console.log('Saved Order:', order);
      } catch (error) {
        console.error('Error saving COD order to database:', error);
        return res.status(500).json({ error: 'Failed to save COD order to database: ' + error.message });
      }

      // Store orderID in session
      req.session.orderID = order._id.toString();

      // Update stock for each product
      try {
        for (const item of cart) {
          const product = await Product.findById(item.productId);
          if (product) {
            const availableSizes = [...new Set(product.stockDetails.map(detail => detail.size).filter(s => s))];
            if (availableSizes.includes(item.size)) {
              const stockDetail = product.stockDetails.find(detail => detail.size === item.size);
              if (stockDetail) {
                stockDetail.stock -= item.quantity;
              }
            } else if (product.size === item.size) {
              product.stock -= item.quantity;
            }
            product.stock = product.stockDetails.reduce((total, detail) => total + detail.stock, 0);
            await product.save();
          }
        }
      } catch (error) {
        console.error('Error updating stock for COD order:', error);
        return res.status(500).json({ error: 'Failed to update stock for COD order: ' + error.message });
      }

      // Clear cart & applied coupon
      try {
        req.user.cart = [];
        req.user.appliedCoupon = null;
        await req.user.save();
      } catch (error) {
        console.error('Error clearing cart for COD order:', error);
        return res.status(500).json({ error: 'Failed to clear cart for COD order: ' + error.message });
      }

      // Prepare product details HTML for email
      const productDetailsHTML = order.products.map(item => `
        <tr>
          <td><img src="${item.image}" alt="${item.name}" style="width: 50px; height: auto;" /></td>
          <td>${item.name}</td>
          <td>${item.size}</td>
          <td>${item.quantity}</td>
          <td>₹${item.price}</td>
          <td>₹${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
      `).join('');

      // Send confirmation email with product details
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: req.user.email,
        subject: 'Order Confirmation - Formal Wear Store',
        html: `
          <p>Dear ${name},</p>
          <p>Thank you for shopping with us! Your order has been placed successfully and is currently being processed.</p>
          <p>We will update you once your order is shipped.</p>
          <h3>Order Details:</h3>
          <table border="1" cellpadding="5" cellspacing="0">
            <thead>
              <tr>
                <th>Image</th>
                <th>Product</th>
                <th>Size</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${productDetailsHTML}
            </tbody>
          </table>
          <p>Order Total (including taxes): ₹${finalTotal.toFixed(2)}</p>
          <p>Payment Method: Cash on Delivery (COD)</p>
          <br>
          <p>Best regards,</p>
          <p>Elite Formal Wear Store Team</p>
        `,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log('COD confirmation email sent successfully to:', req.user.email);
      } catch (error) {
        console.error('Error sending COD confirmation email:', error);
        // Log the error but don't fail the order placement
      }

      // Return success response with order ID
      res.status(201).json({ orderID: order._id.toString() });
    } else {
      return res.status(400).json({ error: 'Invalid payment method.' });
    }
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ error: 'Failed to place the order: ' + error.message });

    // Send failure email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: req.user.email,
      subject: 'Order Placement Failed - Formal Wear Store',
      html: `
        <p>Dear ${req.body.name || 'Customer'},</p>
        <p>We regret to inform you that your order placement failed due to an error.</p>
        <p>Error: ${error.message}</p>
        <p>Please try again or contact our support team for assistance.</p>
        <br>
        <p>Best regards,</p>
        <p>Elite Formal Wear Store Team</p>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Error sending failure email:', emailError);
    }
  }
});

// Handle Razorpay Payment Confirmation
router.post('/confirm-payment', isAuthenticated, async (req, res) => {
  const { orderID, razorpayPaymentID, temporaryOrder } = req.body;
  try {
    // Ensure the status is set to Processing
    temporaryOrder.status = 'Processing';

    // Save the order to the database
    const order = new Order({
      ...temporaryOrder,
      status: 'Processing',
      transactionId: razorpayPaymentID
    });

    await order.save();

    console.log('Saved Order Status (Razorpay):', order.status);
    console.log('Saved Order (Razorpay):', order);

    // Store orderID in session
    req.session.orderID = order._id.toString();

    // Update stock for each product
    for (const item of temporaryOrder.products) {
      const product = await Product.findById(item.product);
      if (product) {
        const availableSizes = [...new Set(product.stockDetails.map(detail => detail.size).filter(s => s))];
        if (availableSizes.includes(item.size)) {
          const stockDetail = product.stockDetails.find(detail => detail.size === item.size);
          if (stockDetail) {
            stockDetail.stock -= item.quantity;
          }
        } else if (product.size === item.size) {
          product.stock -= item.quantity;
        }
        product.stock = product.stockDetails.reduce((total, detail) => total + detail.stock, 0);
        await product.save();
      }
    }

    // Clear cart & applied coupon
    req.user.cart = [];
    req.user.appliedCoupon = null;
    await req.user.save();

    // Prepare product details HTML for email
    const productDetailsHTML = order.products.map(item => `
      <tr>
        <td><img src="${item.image}" alt="${item.name}" style="width: 50px; height: auto;" /></td>
        <td>${item.name}</td>
        <td>${item.size}</td>
        <td>${item.quantity}</td>
        <td>₹${item.price}</td>
        <td>₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    // Send confirmation email with product details and transaction ID
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: req.user.email,
      subject: 'Order Confirmation - Formal Wear Store',
      html: `
        <p>Dear ${order.shippingDetails.name},</p>
        <p>Thank you for shopping with us! Your payment has been successfully processed and your order is currently being processed.</p>
        <p>Transaction ID: ${razorpayPaymentID}</p>
        <p>We will update you once your order is shipped.</p>
        <h3>Order Details:</h3>
        <table border="1" cellpadding="5" cellspacing="0">
          <thead>
            <tr>
              <th>Image</th>
              <th>Product</th>
              <th>Size</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${productDetailsHTML}
          </tbody>
        </table>
        <p>Order Total (including taxes): ₹${order.totalAmount.toFixed(2)}</p>
        <p>Payment Method: Razorpay</p>
        <br>
        <p>Best regards,</p>
        <p>Elite Formal Wear Store Team</p>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('Razorpay confirmation email sent successfully to:', req.user.email);
    } catch (error) {
      console.error('Error sending Razorpay confirmation email:', error);
    }

    // Return success response
    res.status(200).json({ success: true, orderID: order._id.toString() });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: 'Failed to confirm payment: ' + error.message });

    // Send failure email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: req.user.email,
      subject: 'Payment Confirmation Failed - Formal Wear Store',
      html: `
        <p>Dear ${temporaryOrder.shippingDetails.name || 'Customer'},</p>
        <p>We regret to inform you that your payment confirmation failed due to an error.</p>
        <p>Error: ${error.message}</p>
        <p>Please try again or contact our support team for assistance.</p>
        <br>
        <p>Best regards,</p>
        <p>Elite Formal Wear Store Team</p>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Error sending payment failure email:', emailError);
    }
  }
});

// Order Confirmation Page
router.get('/order-confirmation', isAuthenticated, async (req, res) => {
  try {
    let order = null;

    // Check if orderID is in session (set during POST /place-order or POST /confirm-payment)
    if (req.session.orderID) {
      order = await Order.findById(req.session.orderID)
        .populate('products.product'); // Populate product details if needed
    }

    // Fallback: If no orderID in session or order not found, get the most recent order for the user
    if (!order) {
      order = await Order.findOne({ user: req.user._id })
        .sort({ createdAt: -1 }) // Sort by creation date (most recent first)
        .populate('products.product');
    }

    // Clear the orderID from session to avoid reusing it on refresh
    req.session.orderID = null;

    if (!order) {
      req.flash('error', 'No order found.');
      return res.redirect('/cart');
    }

    res.render('orderConfirmation', { user: req.user, order: order });
  } catch (error) {
    console.error('Error fetching order for confirmation:', error);
    req.flash('error', 'Something went wrong while fetching your order.');
    res.redirect('/cart');
  }
});

module.exports = router;