const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  phone: { type: String, required: true, trim: true }, // Make phone required
  isVerified: { type: Boolean, default: false },
  role: { type: String, default: 'user' },
  cart: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      name: String,
      price: Number,
      image: String,
      quantity: { type: Number, default: 1 },
      size: String,
      specificSize: String
    }
  ],
  appliedCoupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
  verificationToken: { type: String },
  resetPasswordOtp: { type: String },
  resetPasswordExpires: { type: Date }
});

// Remove the pre('save') hook to avoid double-hashing
module.exports = mongoose.model('User', userSchema);