const express = require('express');
const router = express.Router();
const Product = require('../models/Product'); // Adjusted path to go up one level

// Helper function to build query and fetch filter options for subcategories
const fetchProductsWithFilters = async (req, baseQuery, categoryName, isNewArrivals = false, isSaleItems = false) => {
  const { subcategory, minPrice, maxPrice, size, color, discount, stock, sort } = req.query;

  // Build the query object
  let query = { ...baseQuery };

  // For new arrivals (last 30 days), unless it's the sale-items route
  if (isNewArrivals && !isSaleItems) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    query.createdAt = { $gte: thirtyDaysAgo };
  }

  // For new arrivals, exclude discounted items unless discount filter is applied
  if (isNewArrivals && !req.query.discount) {
    query.discountedPrice = { $exists: false };
  }

  // For sale items, only include products with a positive discountedPrice
  if (isSaleItems) {
    query.discountedPrice = { $exists: true, $ne: null, $gt: 0 };
  }

  // Subcategory filter
  if (subcategory) {
    query.subcategory = subcategory;
  }

  // Price range filter (using discountedPrice if available, otherwise price)
  if (minPrice || maxPrice) {
    query.$expr = {
      $and: [
        { $gte: [{ $ifNull: ['$discountedPrice', '$price'] }, parseFloat(minPrice) || 0] },
        { $lte: [{ $ifNull: ['$discountedPrice', '$price'] }, parseFloat(maxPrice) || Infinity] }
      ]
    };
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

  // Size filter (using stockDetails, adjusted based on stock filter)
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
      sortOption = { discountedAmount: -1 };
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
  const subcategories = await Product.distinct('subcategory', baseQuery).catch(err => {
    console.error('Error fetching subcategories:', err);
    return [];
  });

  // General sizes
  const sizes = ['S', 'M', 'L', 'XL', 'XXL'];

  const colors = await Product.distinct('color', baseQuery).catch(err => {
    console.error('Error fetching colors:', err);
    return [];
  });

  // Define all available categories with their routes
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

  return { products, subcategories, sizes, colors, allCategories, currentFilters: req.query };
};

// Route to fetch subcategories for a given category
router.get('/:category/subcategories', async (req, res) => {
  try {
    const category = req.params.category;
    let baseQuery = {};

    // Define base query based on the category
    switch (category) {
      case 'new-arrivals':
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        baseQuery = { createdAt: { $gte: thirtyDaysAgo } };
        break;
      case 'sale-items':
        baseQuery = { discountedPrice: { $exists: true, $ne: null, $gt: 0 } };
        break;
      case 'mens-shirts':
        baseQuery = { category: 'men', subcategory: 'shirts' };
        break;
      case 'mens-tshirts':
        baseQuery = { category: 'men', subcategory: 'tshirts' };
        break;
      case 'mens-shoes':
        baseQuery = { category: 'men', subcategory: 'shoes' };
        break;
      case 'mens-accessories':
        baseQuery = { category: 'men', subcategory: 'accessories' };
        break;
      case 'mens-care':
        baseQuery = { category: 'men', subcategory: 'care' };
        break;
      case 'mens-pants':
        baseQuery = { category: 'men', subcategory: 'pants' };
        break;
      case 'womens-shirts':
        baseQuery = { category: 'women', subcategory: 'shirts' };
        break;
      case 'womens-tshirts':
        baseQuery = { category: 'women', subcategory: 'tshirts' };
        break;
      case 'womens-shoes':
        baseQuery = { category: 'women', subcategory: 'shoes' };
        break;
      case 'womens-pant':
        baseQuery = { category: 'women', subcategory: 'pant' };
        break;
      case 'womens-dresses':
        baseQuery = { category: 'women', subcategory: 'dresses' };
        break;
      case 'womens-care':
        baseQuery = { category: 'women', subcategory: 'care' };
        break;
      case 'womens-accessories':
        baseQuery = { category: 'women', subcategory: 'accessories' };
        break;
      case 'kids-shirts':
        baseQuery = { category: 'kids', subcategory: 'shirts' };
        break;
      default:
        baseQuery = {};
    }

    const subcategories = await Product.distinct('subcategory', baseQuery);
    res.json({ subcategories });
  } catch (err) {
    console.error('Error fetching subcategories:', err);
    res.status(500).json({ subcategories: [] });
  }
});

// Route for Men's Shirts
router.get('/mens-shirts', async (req, res) => {
  try {
    const baseQuery = { category: 'men', subcategory: 'shirts' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Men's Shirts");
    res.render('category/mens-shirts', { ...data, routeName: 'mens-shirts', user: req.user || null });
  } catch (err) {
    console.error('Error fetching men\'s shirts:', err);
    res.redirect('/');
  }
});

// Route for Men's T-Shirts
router.get('/mens-tshirts', async (req, res) => {
  try {
    const baseQuery = { category: 'men', subcategory: 'tshirts' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Men's T-Shirts");
    res.render('category/mens-tshirts', { ...data, routeName: 'mens-tshirts', user: req.user || null });
  } catch (err) {
    console.error('Error fetching men\'s t-shirts:', err);
    res.redirect('/');
  }
});

// Route for Men's Shoes
router.get('/mens-shoes', async (req, res) => {
  try {
    const baseQuery = { category: 'men', subcategory: 'shoes' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Men's Shoes");
    res.render('category/mens-shoes', { ...data, routeName: 'mens-shoes', user: req.user || null });
  } catch (err) {
    console.error('Error fetching men\'s shoes:', err);
    res.redirect('/');
  }
});

// Route for Men's Accessories
router.get('/mens-accessories', async (req, res) => {
  try {
    const baseQuery = { category: 'men', subcategory: 'accessories' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Men's Accessories");
    res.render('category/mens-accessories', { ...data, routeName: 'mens-accessories', user: req.user || null });
  } catch (err) {
    console.error('Error fetching men\'s accessories:', err);
    res.redirect('/');
  }
});

// Route for Men's Care
router.get('/mens-care', async (req, res) => {
  try {
    const baseQuery = { category: 'men', subcategory: 'care' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Men's Care");
    res.render('category/mens-care', { ...data, routeName: 'mens-care', user: req.user || null });
  } catch (err) {
    console.error('Error fetching men\'s care:', err);
    res.redirect('/');
  }
});

// Route for Men's Pants
router.get('/mens-pants', async (req, res) => {
  try {
    const baseQuery = { category: 'men', subcategory: 'pants' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Men's Pants");
    res.render('category/mens-pants', { ...data, routeName: 'mens-pants', user: req.user || null });
  } catch (err) {
    console.error('Error fetching men\'s pants:', err);
    res.redirect('/');
  }
});

// Route for Women's Shirts
router.get('/womens-shirts', async (req, res) => {
  try {
    const baseQuery = { category: 'women', subcategory: 'shirts' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Women's Shirts");
    res.render('category/womens-shirts', { ...data, routeName: 'womens-shirts', user: req.user || null });
  } catch (err) {
    console.error('Error fetching women\'s shirts:', err);
    res.redirect('/');
  }
});

// Route for Women's T-Shirts
router.get('/womens-tshirts', async (req, res) => {
  try {
    const baseQuery = { category: 'women', subcategory: 'tshirts' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Women's T-Shirts");
    res.render('category/womens-tshirts', { ...data, routeName: 'womens-tshirts', user: req.user || null });
  } catch (err) {
    console.error('Error fetching women\'s t-shirts:', err);
    res.redirect('/');
  }
});

// Route for Women's Shoes
router.get('/womens-shoes', async (req, res) => {
  try {
    const baseQuery = { category: 'women', subcategory: 'shoes' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Women's Shoes");
    res.render('category/womens-shoes', { ...data, routeName: 'womens-shoes', user: req.user || null });
  } catch (err) {
    console.error('Error fetching women\'s shoes:', err);
    res.redirect('/');
  }
});

// Route for Women's Pants
router.get('/womens-pant', async (req, res) => {
  try {
    const baseQuery = { category: 'women', subcategory: 'pant' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Women's Pants");
    res.render('category/womens-pant', { ...data, routeName: 'womens-pant', user: req.user || null });
  } catch (err) {
    console.error('Error fetching women\'s pants:', err);
    res.redirect('/');
  }
});

// Route for Women's Dresses
router.get('/womens-dresses', async (req, res) => {
  try {
    const baseQuery = { category: 'women', subcategory: 'dresses' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Women's Dresses");
    res.render('category/womens-dresses', { ...data, routeName: 'womens-dresses', user: req.user || null });
  } catch (err) {
    console.error('Error fetching women\'s dresses:', err);
    res.redirect('/');
  }
});

// Route for Women's Care
router.get('/womens-care', async (req, res) => {
  try {
    const baseQuery = { category: 'women', subcategory: 'care' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Women's Care");
    res.render('category/womens-care', { ...data, routeName: 'womens-care', user: req.user || null });
  } catch (err) {
    console.error('Error fetching women\'s care:', err);
    res.redirect('/');
  }
});

// Route for Women's Accessories
router.get('/womens-accessories', async (req, res) => {
  try {
    const baseQuery = { category: 'women', subcategory: 'accessories' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Women's Accessories");
    res.render('category/womens-accessories', { ...data, routeName: 'womens-accessories', user: req.user || null });
  } catch (err) {
    console.error('Error fetching women\'s accessories:', err);
    res.redirect('/');
  }
});

// Route for Kids' Shirts
router.get('/kids-shirts', async (req, res) => {
  try {
    const baseQuery = { category: 'kids', subcategory: 'shirts' };
    const data = await fetchProductsWithFilters(req, baseQuery, "Kids' Shirts");
    res.render('category/kids-shirts', { ...data, routeName: 'kids-shirts', user: req.user || null });
  } catch (err) {
    console.error('Error fetching kids\' shirts:', err);
    res.redirect('/');
  }
});

// Route for New Arrivals
router.get('/new-arrivals', async (req, res) => {
  try {
    const baseQuery = {};
    const data = await fetchProductsWithFilters(req, baseQuery, "New Arrivals", true);
    res.render('category/new-arrivals', { ...data, routeName: 'new-arrivals', user: req.user || null });
  } catch (err) {
    console.error('Error fetching new arrivals:', err);
    res.redirect('/');
  }
});

// Route for Sale Items
router.get('/sale-items', async (req, res) => {
  try {
    const baseQuery = {};
    const data = await fetchProductsWithFilters(req, baseQuery, "Sale Items", false, true);
    res.render('category/sale-items', { ...data, routeName: 'sale-items', user: req.user || null });
  } catch (err) {
    console.error('Error fetching sale items:', err);
    res.redirect('/');
  }
});

module.exports = router;