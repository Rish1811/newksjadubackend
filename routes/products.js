const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const { put } = require('@vercel/blob');
const { cacheRoute, invalidate } = require('../config/cache');

// Memory storage keeps uploads serverless-friendly; Vercel Blob is the sink.
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024, files: 15 },
    fileFilter(req, file, cb) {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Images only!'));
    },
});

// Listings never need the full review array - it is by far the heaviest field.
const LIST_FIELDS = 'name image price sizes category brand rating numReviews countInStock displaySection additionalImages createdAt';

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reviews for the home page.
 * Declared before '/:id' so the literal path wins the match.
 *
 * @route GET /api/products/all/reviews
 */
router.get('/all/reviews', cacheRoute('products', 120), async (req, res, next) => {
    try {
        const products = await Product.find({ 'reviews.0': { $exists: true } })
            .select('name reviews')
            .lean();

        const allReviews = [];
        for (const p of products) {
            for (const r of p.reviews) {
                allReviews.push({
                    productName: p.name,
                    productId: p._id,
                    user: r.name,
                    title: r.title,
                    rating: r.rating,
                    comment: r.comment,
                    images: r.images,
                    createdAt: r.createdAt,
                });
            }
        }

        allReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(allReviews.slice(0, 10));
    } catch (error) {
        next(error);
    }
});

// @desc    Fetch all products
// @route   GET /api/products
// @access  Public
router.get('/', cacheRoute('products', 60), async (req, res, next) => {
    try {
        const filter = {};

        if (req.query.keyword) {
            filter.name = { $regex: escapeRegex(req.query.keyword.trim()), $options: 'i' };
        }
        if (req.query.category) {
            filter.category = { $regex: `^${escapeRegex(req.query.category.trim())}$`, $options: 'i' };
        }
        if (req.query.section) {
            filter.displaySection = req.query.section;
        }
        if (req.query.inStock === 'true') {
            filter.countInStock = { $gt: 0 };
        }

        const limit = Math.min(Number(req.query.limit) || 100, 200);
        const page = Math.max(Number(req.query.page) || 1, 1);

        const products = await Product.find(filter)
            .select(LIST_FIELDS)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json(products);
    } catch (error) {
        next(error);
    }
});

// @desc    Fetch single product
// @route   GET /api/products/:id
// @access  Public
router.get('/:id', cacheRoute('products', 60), async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid product id' });
        }

        const product = await Product.findById(req.params.id).lean();
        if (!product) return res.status(404).json({ message: 'Product not found' });

        res.json(product);
    } catch (error) {
        next(error);
    }
});

/** Upload one buffer to blob storage and return its public URL. */
const uploadFile = async (folder, file) => {
    const safeName = file.originalname.replace(/[^\w.-]/g, '_');
    const blob = await put(`${folder}/${Date.now()}-${safeName}`, file.buffer, { access: 'public' });
    return blob.url;
};

const parseJSON = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
router.post('/', protect, admin, upload.any(), async (req, res, next) => {
    try {
        const { name, price, description, category, countInStock, bulletPoints, sizes, overview, howToUse, displaySection } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({ message: 'Product name is required.' });
        }

        const parsedBulletPoints = parseJSON(bulletPoints, []);
        const parsedSizes = parseJSON(sizes, []);

        let imagePath = '';
        const additionalImagesArray = [];

        for (const file of req.files || []) {
            const url = await uploadFile('products', file);
            if (file.fieldname === 'image') {
                imagePath = url;
            } else if (file.fieldname === 'additionalImages') {
                additionalImagesArray.push(url);
            } else if (file.fieldname.startsWith('sizeImages_')) {
                const index = parseInt(file.fieldname.split('_')[1], 10);
                if (!Number.isNaN(index) && parsedSizes[index]) parsedSizes[index].image = url;
            }
        }

        if (!imagePath) {
            return res.status(400).json({ message: 'A main product image is required.' });
        }

        const product = await Product.create({
            name: String(name).trim(),
            // Number() rather than `||` so a genuine 0 is not replaced.
            price: Number(price) || 0,
            user: req.user._id,
            image: imagePath,
            additionalImages: additionalImagesArray,
            brand: "K'S JADU",
            category: category || 'Uncategorised',
            countInStock: Number(countInStock) || 0,
            numReviews: 0,
            description: description || '',
            bulletPoints: parsedBulletPoints,
            sizes: parsedSizes,
            overview: overview || '',
            howToUse: howToUse || '',
            displaySection: displaySection || 'none',
        });

        await invalidate('products');
        res.status(201).json(product);
    } catch (error) {
        next(error);
    }
});

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
router.put('/:id', protect, admin, upload.any(), async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid product id' });
        }

        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const { name, price, description, category, countInStock, bulletPoints, sizes, overview, howToUse, displaySection } = req.body;
        const files = req.files || [];

        if (name !== undefined && String(name).trim()) product.name = String(name).trim();
        if (description !== undefined) product.description = description;
        if (category !== undefined && category) product.category = category;
        if (overview !== undefined) product.overview = overview;
        if (howToUse !== undefined) product.howToUse = howToUse;
        if (displaySection !== undefined && displaySection) product.displaySection = displaySection;

        // Explicit undefined checks: setting price or stock to 0 is meaningful
        // and the previous `||` fallback silently discarded it.
        if (price !== undefined && price !== '' && !Number.isNaN(Number(price))) {
            product.price = Number(price);
        }
        if (countInStock !== undefined && countInStock !== '' && !Number.isNaN(Number(countInStock))) {
            product.countInStock = Number(countInStock);
        }
        if (bulletPoints !== undefined) {
            product.bulletPoints = parseJSON(bulletPoints, product.bulletPoints);
        }

        if (sizes !== undefined) {
            const parsedSizes = parseJSON(sizes, []);
            for (let i = 0; i < parsedSizes.length; i++) {
                const sizeImgFile = files.find((f) => f.fieldname === `sizeImages_${i}`);
                if (sizeImgFile) parsedSizes[i].image = await uploadFile('products', sizeImgFile);
            }
            product.sizes = parsedSizes;
        }

        const mainImgFile = files.find((f) => f.fieldname === 'image');
        if (mainImgFile) product.image = await uploadFile('products', mainImgFile);

        const addImgFiles = files.filter((f) => f.fieldname === 'additionalImages');
        if (addImgFiles.length > 0) {
            product.additionalImages = await Promise.all(addImgFiles.map((f) => uploadFile('products', f)));
        }

        const updatedProduct = await product.save();
        await invalidate('products');
        res.json(updatedProduct);
    } catch (error) {
        next(error);
    }
});

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res, next) => {
    try {
        const result = await Product.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }
        await invalidate('products');
        res.json({ message: 'Product removed' });
    } catch (error) {
        next(error);
    }
});

// @desc    Create new review
// @route   POST /api/products/:id/reviews
// @access  Private
router.post('/:id/reviews', protect, upload.any(), async (req, res, next) => {
    try {
        const { rating, comment, title } = req.body;

        const numericRating = Number(rating);
        if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({ message: 'Rating must be a whole number from 1 to 5.' });
        }
        if (!comment || !String(comment).trim()) {
            return res.status(400).json({ message: 'Please write a short comment.' });
        }

        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const alreadyReviewed = product.reviews.find(
            (r) => r.user.toString() === req.user._id.toString()
        );
        if (alreadyReviewed) {
            return res.status(400).json({ message: 'You have already reviewed this product.' });
        }

        const reviewImagesArray = [];
        for (const file of req.files || []) {
            reviewImagesArray.push(await uploadFile('reviews', file));
        }

        product.reviews.push({
            name: req.user.name,
            title: title || '',
            rating: numericRating,
            comment: String(comment).trim(),
            images: reviewImagesArray,
            user: req.user._id,
        });

        product.numReviews = product.reviews.length;
        product.rating = product.reviews.reduce((acc, item) => item.rating + acc, 0) / product.reviews.length;

        await product.save();
        await invalidate('products');
        res.status(201).json({ message: 'Review added' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
