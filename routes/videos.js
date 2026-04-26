const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const { put } = require('@vercel/blob');

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit for reels
    },
    fileFilter: function (req, file, cb) {
        console.log('Receiving file:', file.originalname, 'Mime:', file.mimetype);
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Videos only!'));
        }
    }
});

// @desc    Get all videos
// @route   GET /api/videos
// @access  Public
router.get('/', async (req, res) => {
    try {
        const videos = await Video.find({}).populate('productLink', 'name price image rating numReviews');
        res.json(videos);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Add a video
// @route   POST /api/videos
// @access  Private/Admin
router.post('/', protect, admin, upload.single('video'), async (req, res) => {
    try {
        const { title, productLink } = req.body;
        let videoUrl = '';

        if (req.file) {
            const blob = await put(`videos/${Date.now()}-${req.file.originalname}`, req.file.buffer, {
                access: 'public',
            });
            videoUrl = blob.url;
        }

        const video = new Video({
            title: title || 'New Short',
            videoUrl,
            productLink: productLink || null
        });

        const createdVideo = await video.save();
        res.status(201).json(createdVideo);
    } catch (error) {
        console.error('Video Upload Error:', error);
        res.status(500).json({ 
            message: 'Video upload failed', 
            error: error.message,
            stack: process.env.NODE_ENV === 'production' ? null : error.stack
        });
    }
});

// @desc    Delete a video
// @route   DELETE /api/videos/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (video) {
            await Video.deleteOne({ _id: video._id });
            res.json({ message: 'Video removed' });
        } else {
            res.status(404).json({ message: 'Video not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
