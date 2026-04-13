const express = require('express');
const router = express.Router();
const Concern = require('../models/Concern');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const { put } = require('@vercel/blob');

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

// @desc    Get all concerns
// @route   GET /api/concerns
// @access  Public
router.get('/', async (req, res) => {
    try {
        const concerns = await Concern.find({});
        res.json(concerns);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Add a concern
// @route   POST /api/concerns
// @access  Private/Admin
router.post('/', protect, admin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded' });
        }

        const blob = await put(`concerns/${Date.now()}-${req.file.originalname}`, req.file.buffer, {
            access: 'public',
        });

        const concern = new Concern({
            title: req.body.title || 'New Concern',
            image: blob.url,
            linkUrl: req.body.linkUrl || ''
        });

        const createdConcern = await concern.save();
        res.status(201).json(createdConcern);
    } catch (error) {
        console.error('Concern upload error:', error);
        res.status(500).json({ message: 'Concern upload failed', details: error.message });
    }
});

// @desc    Delete a concern
// @route   DELETE /api/concerns/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const concern = await Concern.findById(req.params.id);

        if (concern) {
            await Concern.deleteOne({ _id: concern._id });
            res.json({ message: 'Concern removed' });
        } else {
            res.status(404).json({ message: 'Concern not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
