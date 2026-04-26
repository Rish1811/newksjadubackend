const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { protect, admin } = require('../middleware/authMiddleware');

// @desc    Get settings
// @route   GET /api/settings
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
    try {
        let settings = await Settings.findOne({});
        if (!settings) {
            settings = await Settings.create({});
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Update settings
// @route   PUT /api/settings
// @access  Private/Admin
router.put('/', protect, admin, async (req, res) => {
    try {
        let settings = await Settings.findOne({});
        if (!settings) {
            settings = new Settings(req.body);
        } else {
            Object.assign(settings, req.body);
        }
        const updatedSettings = await settings.save();
        res.json(updatedSettings);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
