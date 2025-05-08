const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// GET /search?q=<query>
router.get('/', async (req, res) => {
  try {
    // Safely get and validate searchQuery as a string
    const searchQueryRaw = req.query.q || req.query.query || '';
    const searchQuery = typeof searchQueryRaw === 'string' ? searchQueryRaw.trim() : '';
    console.log('Received search query in /search:', searchQuery);
    console.log('Query parameters in /search:', req.query);

    // Get additional filter parameters
    const { category, subcategory, minPrice, maxPrice, size, color, discount, stock, sort } = req.query;

    const user = req.session.user || null;

    // If a category filter is applied, redirect to /products with the same query parameters but without q
    if (category) {
      const queryParams = new URLSearchParams();
      queryParams.set('category', category);
      if (subcategory) queryParams.set('subcategory', subcategory);
      if (minPrice) queryParams.set('minPrice', minPrice);
      if (maxPrice) queryParams.set('maxPrice', maxPrice);
      if (size) queryParams.set('size', size);
      if (color) queryParams.set('color', color);
      if (discount) queryParams.set('discount', discount);
      if (stock) queryParams.set('stock', stock);
      if (sort) queryParams.set('sort', sort);
      console.log('Redirecting to /products with query:', queryParams.toString());
      return res.redirect(`/products?${queryParams.toString()}`);
    }

    // Build the initial query object for search
    let query = {};
    let isSearchActive = false;

    if (searchQuery) {
      const searchTerms = searchQuery.toLowerCase().split(/\s+/).filter(term => term.length > 0);
      console.log('Search terms:', searchTerms);

      const colors = ['white', 'black', 'pink', 'grey', 'blue', 'red', 'green'];
      const categories = ['men', 'women', 'kids'];
      const subcategories = ['shirts', 'tshirts', 'shoes', 'accessories', 'care', 'pants', 'pant', 'dresses'];

      const colorTerms = searchTerms.filter(term => colors.includes(term));
      const categoryTerms = searchTerms.filter(term => categories.includes(term));
      const subcategoryTerms = searchTerms.filter(term => subcategories.includes(term));
      const otherTerms = searchTerms.filter(
        term => !colors.includes(term) && !categories.includes(term) && !subcategories.includes(term)
      );

      query.$and = [
        ...(categoryTerms.length > 0
          ? [{ category: { $in: categoryTerms.map(term => new RegExp(`^${term}$`, 'i')) } }]
          : []),
        ...(subcategoryTerms.length > 0
          ? [{ subcategory: { $in: subcategoryTerms.map(term => new RegExp(`^${term}$`, 'i')) } }]
          : []),
        ...(colorTerms.length > 0
          ? [{ color: { $in: colorTerms.map(term => new RegExp(`^${term}$`, 'i')) } }]
          : []),
        ...(otherTerms.length > 0
          ? [
              {
                $or: otherTerms.map(term => ({
                  $or: [
                    { name: { $regex: term, $options: 'i' } },
                    { description: { $regex: term, $options: 'i' } }
                  ]
                }))
              }
            ]
          : [])
      ];

      if (query.$and.length === 0) {
        query.$or = [
          { name: { $regex: searchQuery, $options: 'i' } },
          { description: { $regex: searchQuery, $options: 'i' } },
          { category: { $regex: searchQuery, $options: 'i' } },
          { subcategory: { $regex: searchQuery, $options: 'i' } }
        ];
      }

      isSearchActive = true;
    }

    if (subcategory) {
      query.subcategory = subcategory;
    }

    if (minPrice || maxPrice) {
      query.$expr = query.$expr || { $and: [] };
      query.$expr.$and.push(
        { $gte: [{ $ifNull: ['$discountedPrice', '$price'] }, parseFloat(minPrice) || 0] },
        { $lte: [{ $ifNull: ['$discountedPrice', '$price'] }, parseFloat(maxPrice) || Infinity] }
      );
    }

    if (color) {
      query.color = color;
    }

    if (discount === 'yes') {
      query.$expr = query.$expr || { $and: [] };
      query.$expr.$and.push({ $lt: ['$discountedPrice', '$price'] });
      query.discountedPrice = { $exists: true, $ne: null };
    }

    if (stock && stock !== '') {
      if (stock === 'in') {
        query['stockDetails.stock'] = { $gt: 0 };
      } else if (stock === 'out') {
        query['stockDetails.stock'] = { $lte: 0 };
      }
    }

    if (size) {
      if (stock === 'out') {
        query['stockDetails'] = { $elemMatch: { size: size, stock: { $lte: 0 } } };
      } else {
        query['stockDetails'] = { $elemMatch: { size: size, stock: { $gt: 0 } } };
      }
    }

    console.log('Search Query being executed:', JSON.stringify(query, null, 2));

    let productsQuery = Product.find(query);

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
      }
    }

    productsQuery = productsQuery.sort(sortOption);

    const products = await productsQuery.lean();

    const categories = await Product.distinct('category', query);
    const subcategories = await Product.distinct('subcategory', query);
    const sizes = await Product.distinct('size', query);
    const rawSpecificSizes = await Product.distinct('stockDetails.size', query);
    const specificSizes = rawSpecificSizes.filter(size => size != null && size.toString().trim() !== '');
    const availableColors = await Product.distinct('color', query);
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
      { name: "Women's Accessories", route: "womens-accessories" },
      { name: "Women's Care", route: "womens-care" },
      { name: "Women's Pants", route: "womens-pant" },
      { name: "Women's Dresses", route: "womens-dresses" },
      { name: "Kids' Shirts", route: "kids-shirts" }
    ];

    console.log('Rendering with products:', products);

    res.render('search', {
      routeName: 'search',
      searchQuery: searchQuery,
      products: products,
      categories: categories,
      subcategories: subcategories,
      sizes: sizes,
      specificSizes: specificSizes,
      specificSizesString: JSON.stringify(specificSizes),
      colors: availableColors,
      allCategories: allCategories,
      currentFilters: req.query,
      isSearchActive,
      user: user
    });
  } catch (err) {
    console.error('Error in search route:', err);
    req.flash('error_msg', 'An error occurred while performing the search');
    res.status(500).redirect('/');
  }
});

module.exports = router;