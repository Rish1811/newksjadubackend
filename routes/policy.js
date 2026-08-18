const express = require('express');
const router = express.Router();
const Policy = require('../models/Policy');
const { protect, admin } = require('../middleware/authMiddleware');
const { cacheRoute, invalidate } = require('../config/cache');

// @desc    Get policy by type
// @route   GET /api/policies/:type
// @access  Public
router.get('/:type', cacheRoute('policies', 600), async (req, res) => {
    try {
        const policy = await Policy.findOne({ type: req.params.type });
        if (policy) {
            res.json(policy);
        } else {
            // Return empty policy if not found
            res.status(404).json({ message: 'Policy not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Upsert policy
// @route   POST /api/policies
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
    try {
        const { type, title, content } = req.body;

        const filter = { type };
        const update = { title, content };
        const options = { upsert: true, new: true, setDefaultsOnInsert: true };

        const policy = await Policy.findOneAndUpdate(filter, update, options);
        await invalidate('policies');
        res.status(200).json(policy);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
