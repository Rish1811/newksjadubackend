const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const { put } = require('@vercel/blob');

// Multer Config: Use memory storage for Vercel/serverless environments
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Images only!'));
        }
    }
});

// @desc    Fetch all products
// @route   GET /api/products
// @access  Public
router.get('/', async (req, res) => {
    try {
        const keyword = req.query.keyword ? {
            name: {
                $regex: req.query.keyword,
                $options: 'i'
            }
        } : {};

        const category = req.query.category ? {
            category: { $regex: `^${req.query.category.trim()}$`, $options: 'i' }
        } : {};

        const products = await Product.find({ ...keyword, ...category });
        res.json(products);
    } catch (error) {
        console.error('Fetch products error:', error);
        res.status(500).json({ message: 'Server Error', details: error.message });
    }
});

// @desc    Fetch single product Rishidogne456@js
// @route   GET /api/products/:id
// @access  Public
router.get('/:id', async (req, res) => {
    // Avoid conflicting with "all/reviews"
    if (req.params.id === 'all') return res.status(404).json({ message: 'Not found' });

    try {
        const product = await Product.findById(req.params.id);
        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        console.error('Fetch single product error:', error);
        res.status(500).json({ message: 'Server Error (Fetch ID)', details: error.message });
    }
});

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
router.post('/', protect, admin, upload.any(), async (req, res) => {
    try {
        const { name, price, description, category, countInStock, bulletPoints, sizes, overview, howToUse } = req.body;

        let imagePath = '';
        let additionalImagesArray = [];

        // Parse JSON strings from formData first
        let parsedBulletPoints = [];
        try { if (bulletPoints) parsedBulletPoints = JSON.parse(bulletPoints); } catch (e) { }

        let parsedSizes = [];
        try { if (sizes) parsedSizes = JSON.parse(sizes); } catch (e) { }

        // Upload files to Vercel Blob
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const blob = await put(`products/${Date.now()}-${file.originalname}`, file.buffer, {
                    access: 'public',
                });

                if (file.fieldname === 'image') {
                    imagePath = blob.url;
                } else if (file.fieldname === 'additionalImages') {
                    additionalImagesArray.push(blob.url);
                } else if (file.fieldname.startsWith('sizeImages_')) {
                    const index = parseInt(file.fieldname.split('_')[1], 10);
                    if (!isNaN(index) && parsedSizes[index]) {
                        parsedSizes[index].image = blob.url;
                    }
                }
            }
        }

        const product = new Product({
            name: name || 'Sample Name',
            price: price || 0,
            user: req.user._id,
            image: imagePath || '/images/sample.jpg',
            additionalImages: additionalImagesArray,
            brand: "K'S JADU",
            category: category || 'Sample Category',
            countInStock: countInStock || 0,
            numReviews: 0,
            description: description || 'Sample description',
            bulletPoints: parsedBulletPoints,
            sizes: parsedSizes,
            overview: overview || '',
            howToUse: howToUse || ''
        });

        const createdProduct = await product.save();
        res.status(201).json(createdProduct);
    } catch (error) {
        console.error('Product Creation Error:', error);
        res.status(500).json({ message: 'Product creation failed', details: error.message });
    }
});

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
router.put('/:id', protect, admin, upload.any(), async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (product) {
            const { name, price, description, category, countInStock, bulletPoints, sizes, overview, howToUse } = req.body;

            product.name = name || product.name;
            product.price = price || product.price;
            product.description = description || product.description;
            product.category = category || product.category;
            product.countInStock = countInStock || product.countInStock;
            product.bulletPoints = bulletPoints ? JSON.parse(bulletPoints) : product.bulletPoints;
            product.overview = overview || product.overview;
            product.howToUse = howToUse || product.howToUse;

            if (sizes) {
                const parsedSizes = JSON.parse(sizes);
                // Update size images if new ones provided
                for (let i = 0; i < parsedSizes.length; i++) {
                    const sizeImgField = `sizeImages_${i}`;
                    const sizeImgFile = req.files.find(f => f.fieldname === sizeImgField);
                    if (sizeImgFile) {
                        const blob = await put(`products/${Date.now()}-${sizeImgFile.originalname}`, sizeImgFile.buffer, {
                            access: 'public',
                        });
                        parsedSizes[i].image = blob.url;
                    }
                }
                product.sizes = parsedSizes;
            }

            // Handle main image update
            const mainImgFile = req.files.find(f => f.fieldname === 'image');
            if (mainImgFile) {
                const blob = await put(`products/${Date.now()}-${mainImgFile.originalname}`, mainImgFile.buffer, {
                    access: 'public',
                });
                product.image = blob.url;
            }

            // Handle additional images (append or replace? Usually replace in simpler logic, but let's append for now or handle as provided)
            const addImgFiles = req.files.filter(f => f.fieldname === 'additionalImages');
            if (addImgFiles.length > 0) {
                const addImgUrls = [];
                for (const file of addImgFiles) {
                    const blob = await put(`products/${Date.now()}-${file.originalname}`, file.buffer, {
                        access: 'public',
                    });
                    addImgUrls.push(blob.url);
                }
                product.additionalImages = addImgUrls; // Replacing gallery for simplicity in edit
            }

            const updatedProduct = await product.save();
            res.json(updatedProduct);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        console.error('Product Update Error:', error);
        res.status(500).json({ message: 'Product update failed', details: error.message });
    }
});

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (product) {
            await Product.deleteOne({ _id: product._id });
            res.json({ message: 'Product removed' });
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Create new review
// @route   POST /api/products/:id/reviews
// @access  Private
router.post('/:id/reviews', protect, upload.any(), async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const product = await Product.findById(req.params.id);

        if (product) {
            const alreadyReviewed = product.reviews.find(
                (r) => r.user.toString() === req.user._id.toString()
            );

            if (alreadyReviewed) {
                return res.status(400).json({ message: 'Product already reviewed' });
            }

            let reviewImagesArray = [];
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    const blob = await put(`reviews/${Date.now()}-${file.originalname}`, file.buffer, {
                        access: 'public',
                    });
                    reviewImagesArray.push(blob.url);
                }
            }

            const review = {
                name: req.user.name,
                rating: Number(rating),
                comment,
                images: reviewImagesArray,
                user: req.user._id,
            };

            product.reviews.push(review);
            product.numReviews = product.reviews.length;
            product.rating = product.reviews.reduce((acc, item) => item.rating + acc, 0) / product.reviews.length;

            await product.save();
            res.status(201).json({ message: 'Review added' });
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Get top/recent reviews across all products for the homepage
// @route   GET /api/products/all/reviews
// @access  Public
router.get('/all/reviews', async (req, res) => {
    try {
        const products = await Product.find({ 'reviews.0': { $exists: true } }).select('name reviews');
        let allReviews = [];
        products.forEach(p => {
            p.reviews.forEach(r => {
                allReviews.push({
                    productName: p.name,
                    productId: p._id,
                    user: r.name,
                    rating: r.rating,
                    comment: r.comment,
                    images: r.images,
                    createdAt: r.createdAt
                });
            });
        });

        // Sort newest first
        allReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(allReviews.slice(0, 10)); // return last 10
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
