const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  discountedPrice: { type: Number },
  category: { type: String, enum: ['men', 'women', 'kids'], required: true },
  subcategory: { type: String, required: true },
  color: { type: String, required: true },
  size: { type: String }, // Previously defaultSize, now just size
  image: { type: String, required: true },
  stock: { type: Number, required: true, default: 0 },
  stockDetails: [{
    color: { type: String },
    size: { type: String },
    stock: { type: Number, default: 0 }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Product', productSchema);