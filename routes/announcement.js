const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const { protect, admin } = require('../middleware/authMiddleware');

// @desc    Get announcement
// @route   GET /api/announcements
// @access  Public
router.get('/', async (req, res) => {
    try {
        const announcements = await Announcement.find({});
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Update announcement
// @route   POST /api/announcements
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
    try {
        const { text, isActive } = req.body;
        await Announcement.deleteMany({});
        const announcement = new Announcement({ text, isActive });
        const createdAnnouncement = await announcement.save();
        res.status(201).json(createdAnnouncement);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
