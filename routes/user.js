const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

const fs = require('fs');

// Ensure uploads directory exists
const { put } = require('@vercel/blob');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
    const users = await User.find({});
    res.json(users);
});

// Multer configuration for image upload in memory
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

// Check file type
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb('Images only!');
    }
}

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin,
            image: user.image || null
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
});

// @desc    Upload user profile image
// @route   POST /api/users/profile/image
// @access  Private
router.post('/profile/image', protect, upload.single('image'), async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded' });
        }

        const blob = await put(`users/${user._id}-${Date.now()}-${req.file.originalname}`, req.file.buffer);

        user.image = blob.url;
        await user.save();

        console.log(`Image saved for ${user.email}: ${user.image}`);

        res.json({
            message: 'Image uploaded successfully',
            image: user.image
        });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ message: 'Server error during upload', details: error.message });
    }
});

module.exports = router;
