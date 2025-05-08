const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  products: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      name: String,
      price: Number,
      quantity: { type: Number, required: true },
      size: String // Removed specificSize to align with Product model
    }
  ],
  totalAmount: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  shippingDetails: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },

  },
  paymentMethod: {
    type: String,
    enum: ['creditCard', 'debitCard', 'razorpay', 'cod'],
    default: 'razorpay', // Set default payment method to razorpay
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Shipped', 'Completed', 'Delivered', 'Cancelled'],
    default: 'Processing' // Set default status to Processing
  },
  transactionId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Middleware to update 'updatedAt' timestamp before saving
orderSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Order', orderSchema);