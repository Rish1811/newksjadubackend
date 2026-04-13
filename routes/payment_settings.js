const express = require('express');
const router = express.Router();
const PaymentSettings = require('../models/PaymentSettings');

// @desc    Get Razorpay configuration
// @route   GET /api/payment/settings
// @access  Public (only non-sensitive information like environment and status)
router.get('/config', async (req, res) => {
    try {
        let settings = await PaymentSettings.findOne();
        if (!settings) {
            settings = await PaymentSettings.create({});
        }

        const isProduction = settings.environment === 'production';
        const activeKey = isProduction ? settings.liveKeyId : settings.testKeyId;

        res.json({
            isEnabled: settings.isRazorpayEnabled,
            environment: settings.environment,
            keyId: activeKey
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// @desc    Get All Razorpay configurations for Admin Dashboard
// @route   GET /api/payment/settings/admin
// @access  Private (Admin Role only - assume current simple implementation for now)
router.get('/admin', async (req, res) => {
    try {
        let settings = await PaymentSettings.findOne();
        if (!settings) {
            settings = await PaymentSettings.create({});
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// @desc    Update Razorpay configuration
// @route   POST /api/payment/settings/admin
// @access  Private (Admin Only)
router.post('/admin', async (req, res) => {
    try {
        let settings = await PaymentSettings.findOne();

        if (settings) {
            settings = await PaymentSettings.findOneAndUpdate({}, req.body, { new: true });
        } else {
            settings = await PaymentSettings.create(req.body);
        }

        res.json({ message: 'Settings updated successfully', settings });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
