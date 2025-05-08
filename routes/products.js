const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// Product listing with filtering and sorting
router.get('/', async (req, res) => {
  try {
    // Log the incoming query parameters for debugging
    console.log('Incoming query parameters in /products:', req.query);

    const { category, subcategory, minPrice, maxPrice, size, color, discount, stock, sort } = req.query;

    // Build the initial query object
    let query = {};
    let isSearchActive = false; // Explicitly set to false since this route doesn't handle search

    // Map route-based category to actual category and subcategory for query
    let mappedCategory = '';
    let mappedSubcategory = '';

    if (category) {
      if (category === 'New Arrivals') {
        // Filter for products added in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query.createdAt = { $gte: thirtyDaysAgo };
      } else if (category === 'Sale Items') {
        // Filter for products with a discountedPrice less than price
        query.$expr = query.$expr || { $and: [] };
        query.$expr.$and.push({ $lt: ['$discountedPrice', '$price'] });
        query.discountedPrice = { $exists: true, $ne: null, $gt: 0 };
      } else {
        // Map the display category to actual category and subcategory
        switch (category) {
          case "Men's Shirts":
            mappedCategory = 'men';
            mappedSubcategory = 'shirts';
            break;
          case "Men's T-Shirts":
            mappedCategory = 'men';
            mappedSubcategory = 'tshirts';
            break;
          case "Men's Shoes":
            mappedCategory = 'men';
            mappedSubcategory = 'shoes';
            break;
          case "Men's Accessories":
            mappedCategory = 'men';
            mappedSubcategory = 'accessories';
            break;
          case "Men's Care":
            mappedCategory = 'men';
            mappedSubcategory = 'care';
            break;
          case "Men's Pants":
            mappedCategory = 'men';
            mappedSubcategory = 'pants';
            break;
          case "Women's Shirts":
            mappedCategory = 'women';
            mappedSubcategory = 'shirts';
            break;
          case "Women's T-Shirts":
            mappedCategory = 'women';
            mappedSubcategory = 'tshirts';
            break;
          case "Women's Shoes":
            mappedCategory = 'women';
            mappedSubcategory = 'shoes';
            break;
          case "Women's Pants":
            mappedCategory = 'women';
            mappedSubcategory = 'pant';
            break;
          case "Women's Dresses":
            mappedCategory = 'women';
            mappedSubcategory = 'dresses';
            break;
          case "Women's Care":
            mappedCategory = 'women';
            mappedSubcategory = 'care';
            break;
          case "Women's Accessories":
            mappedCategory = 'women';
            mappedSubcategory = 'accessories';
            break;
          case "Kids' Shirts":
            mappedCategory = 'kids';
            mappedSubcategory = 'shirts';
            break;
          default:
            mappedCategory = category;
        }
        if (mappedCategory) query.category = mappedCategory;
        if (mappedSubcategory) query.subcategory = mappedSubcategory;
      }
    }

    // Subcategory filter (if provided explicitly via query parameter)
    if (subcategory) {
      query.subcategory = subcategory;
    }

    // Price range filter (using discountedPrice if available, otherwise price)
    if (minPrice || maxPrice) {
      query.$expr = query.$expr || { $and: [] };
      query.$expr.$and.push(
        { $gte: [{ $ifNull: ['$discountedPrice', '$price'] }, parseFloat(minPrice) || 0] },
        { $lte: [{ $ifNull: ['$discountedPrice', '$price'] }, parseFloat(maxPrice) || Infinity] }
      );
    }

    // Color filter
    if (color) {
      query.color = color;
    }

    // Discount filter (products with discountedPrice less than price)
    if (discount === 'yes') {
      query.$expr = query.$expr || { $and: [] };
      query.$expr.$and.push({ $lt: ['$discountedPrice', '$price'] });
      query.discountedPrice = { $exists: true, $ne: null };
    }

    // Stock availability filter (using stockDetails)
    if (stock && stock !== '') {
      if (stock === 'in') {
        query['stockDetails.stock'] = { $gt: 0 };
      } else if (stock === 'out') {
        query['stockDetails.stock'] = { $lte: 0 };
      }
    }

    // Size filter (using stockDetails)
    if (size) {
      if (stock === 'out') {
        query['stockDetails'] = { $elemMatch: { size: size, stock: { $lte: 0 } } };
      } else {
        query['stockDetails'] = { $elemMatch: { size: size, stock: { $gt: 0 } } };
      }
    }

    console.log('Query being executed:', JSON.stringify(query, null, 2));

    // Fetch products with filters
    let productsQuery = Product.find(query);

    // Sorting with default value
    let sortOption = { createdAt: -1 };
    if (sort) {
      if (sort === 'price-low-to-high') {
        sortOption = { 'discountedPrice': 1, 'price': 1 };
      } else if (sort === 'price-high-to-low') {
        sortOption = { 'discountedPrice': -1, 'price': -1 };
      } else if (sort === 'newest') {
        sortOption = { createdAt: -1 };
      } else if (sort === 'discount') {
        sortOption = { 'discountedPrice': -1 };
      } else if (sort === 'featured') {
        sortOption = { featured: -1 };
      }
    }

    // Apply sorting
    productsQuery = productsQuery.sort(sortOption);

    // Execute query and convert to plain objects
    const products = await productsQuery.lean().catch(err => {
      console.error('Query error:', err);
      return [];
    });

    // Define available filter options
    const categories = await Product.distinct('category', query).catch(err => {
      console.error('Error fetching categories:', err);
      return [];
    });

    const subcategories = await Product.distinct('subcategory', query).catch(err => {
      console.error('Error fetching subcategories:', err);
      return [];
    });

    const sizes = ['S', 'M', 'L', 'XL', 'XXL'];

    const colors = await Product.distinct('color', query).catch(err => {
      console.error('Error fetching colors:', err);
      return [];
    });

    // Define allCategories (updated for consistency)
    const allCategories = [
      { name: "New Arrivals", route: "new-arrivals" },
      { name: "Sale Items", route: "sale-items" },
      { name: "Men's Shirts", route: "mens-shirts" },
      { name: "Men's T-Shirts", route: "mens-tshirts" },
      { name: "Men's Shoes", route: "mens-shoes" },
      { name: "Men's Accessories", route: "mens-accessories" },
      { name: "Men's Care", route: "mens-care" },
      { name: "Men's Pants", route: "mens-pants" },
      { name: "Women's Shirts", route: "womens-shirts" },
      { name: "Women's T-Shirts", route: "womens-tshirts" },
      { name: "Women's Shoes", route: "womens-shoes" },
      { name: "Women's Pants", route: "womens-pant" },
      { name: "Women's Dresses", route: "womens-dresses" },
      { name: "Women's Care", route: "womens-care" },
      { name: "Women's Accessories", route: "womens-accessories" },
      { name: "Kids' Shirts", route: "kids-shirts" }
    ];

    console.log('Rendering with products:', products);
    console.log('Current filters:', req.query);

    res.render('products', {
      products,
      categories,
      subcategories,
      sizes,
      colors,
      allCategories,
      currentFilters: req.query,
      isSearchActive,
      searchQuery: '', // Explicitly set to empty string
      user: req.user || null
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.redirect('/');
  }
});

// Detailed product page
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) {
      return res.redirect('/products');
    }
    const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
    res.render('product', { 
      product, 
      sizes,
      user: req.user || null
    });
  } catch (err) {
    console.error('Error fetching product:', err);
    res.redirect('/products');
  }
});

module.exports = router;