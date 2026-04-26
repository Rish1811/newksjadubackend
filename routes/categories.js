const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

const { put } = require('@vercel/blob');

// Use memory storage for Vercel Blob
const storage = multer.memoryStorage();
const upload = multer({ storage });

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
router.get('/', async (req, res) => {
    try {
        const categories = await Category.find({});
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Add a category
// @route   POST /api/categories
// @access  Private/Admin
router.post('/', protect, admin, upload.single('image'), async (req, res) => {
    try {
        const { name, bgColor, borderColor } = req.body;
        let image = '';

        if (req.file) {
            const blob = await put(`categories/${Date.now()}-${req.file.originalname}`, req.file.buffer, {
                access: 'public',
            });
            image = blob.url;
        }

        const categoryExists = await Category.findOne({ name });
        if (categoryExists) {
            return res.status(400).json({ message: 'Category already exists' });
        }

        const category = new Category({
            name,
            image,
            bgColor,
            borderColor
        });

        const createdCategory = await category.save();
        res.status(201).json(createdCategory);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (category) {
            await Category.deleteOne({ _id: category._id });
            res.json({ message: 'Category removed' });
        } else {
            res.status(404).json({ message: 'Category not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
