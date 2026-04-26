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

// @desc    Add announcement
// @route   POST /api/announcements
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
    try {
        const { text, isActive } = req.body;
        const announcement = new Announcement({ text, isActive });
        const createdAnnouncement = await announcement.save();
        res.status(201).json(createdAnnouncement);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id);
        if (announcement) {
            await Announcement.deleteOne({ _id: announcement._id });
            res.json({ message: 'Announcement removed' });
        } else {
            res.status(404).json({ message: 'Announcement not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
