const express = require('express');
const router = express.Router();
const Banner = require('../models/Banner');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const { put } = require('@vercel/blob');

// Multer Config: Use memory storage for serverless
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    fileFilter: function (req, file, cb) {
        // accepting all image types for better compatibility
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Images only!'));
        }
    }
});

// @desc    Get all banners
// @route   GET /api/banners
// @access  Public
router.get('/', async (req, res) => {
    try {
        const banners = await Banner.find({});
        res.json(banners);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Add a banner
// @route   POST /api/banners
// @access  Private/Admin
router.post('/', protect, admin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded' });
        }

        const blob = await put(`banners/${Date.now()}-${req.file.originalname}`, req.file.buffer, {
            access: 'public',
        });

        const banner = new Banner({
            image: blob.url,
            title: req.body.title || ''
        });

        const createdBanner = await banner.save();
        res.status(201).json(createdBanner);
    } catch (error) {
        console.error('Banner upload error:', error);
        res.status(500).json({ message: 'Banner upload failed', details: error.message });
    }
});

// @desc    Delete a banner
// @route   DELETE /api/banners/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.id);

        if (banner) {
            await Banner.deleteOne({ _id: banner._id });
            res.json({ message: 'Banner removed' });
        } else {
            res.status(404).json({ message: 'Banner not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
