const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const { put } = require('@vercel/blob');

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
        const products = await Product.find({});
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
                }
            }
        }

        // Parse JSON strings from formData
        let parsedBulletPoints = [];
        try { if (bulletPoints) parsedBulletPoints = JSON.parse(bulletPoints); } catch (e) { }

        let parsedSizes = [];
        try { if (sizes) parsedSizes = JSON.parse(sizes); } catch (e) { }

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
                req.files.forEach(file => {
                    reviewImagesArray.push(`/${file.path.replace(/\\/g, '/')}`);
                });
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
