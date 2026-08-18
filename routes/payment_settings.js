const express = require('express');
const router = express.Router();
const PaymentSettings = require('../models/PaymentSettings');
const { protect, admin } = require('../middleware/authMiddleware');

const getSettings = async () => {
    let settings = await PaymentSettings.findOne();
    if (!settings) settings = await PaymentSettings.create({});
    return settings;
};

/** Show only the last 4 characters of a secret, so the admin can tell which
 *  key is configured without the value ever leaving the server. */
const maskSecret = (value) =>
    value ? `${'•'.repeat(Math.max(0, String(value).length - 4))}${String(value).slice(-4)}` : '';

// @desc    Public Razorpay config (publishable key only)
// @route   GET /api/payment_settings/config
// @access  Public
router.get('/config', async (req, res, next) => {
    try {
        const settings = await getSettings();
        const isProduction = settings.environment === 'production';

        res.json({
            isEnabled: settings.isRazorpayEnabled,
            environment: settings.environment,
            // key_id is designed to be public; key_secret never is.
            keyId: isProduction ? settings.liveKeyId : settings.testKeyId,
        });
    } catch (err) {
        next(err);
    }
});

// @desc    Read settings for the admin dashboard
// @route   GET /api/payment_settings/admin
// @access  Private/Admin
router.get('/admin', protect, admin, async (req, res, next) => {
    try {
        const settings = await getSettings();

        // Secrets are returned masked. The dashboard only needs to display
        // which key is set, and it re-submits a full value to change one.
        res.json({
            _id: settings._id,
            isRazorpayEnabled: settings.isRazorpayEnabled,
            environment: settings.environment,
            testKeyId: settings.testKeyId,
            liveKeyId: settings.liveKeyId,
            testKeySecret: maskSecret(settings.testKeySecret),
            liveKeySecret: maskSecret(settings.liveKeySecret),
            hasTestSecret: Boolean(settings.testKeySecret),
            hasLiveSecret: Boolean(settings.liveKeySecret),
        });
    } catch (err) {
        next(err);
    }
});

// @desc    Update settings
// @route   POST /api/payment_settings/admin
// @access  Private/Admin
router.post('/admin', protect, admin, async (req, res, next) => {
    try {
        const settings = await getSettings();
        const { isRazorpayEnabled, environment, testKeyId, liveKeyId, testKeySecret, liveKeySecret } = req.body;

        if (isRazorpayEnabled !== undefined) settings.isRazorpayEnabled = Boolean(isRazorpayEnabled);
        if (environment && ['test', 'production'].includes(environment)) settings.environment = environment;
        if (testKeyId !== undefined) settings.testKeyId = String(testKeyId).trim();
        if (liveKeyId !== undefined) settings.liveKeyId = String(liveKeyId).trim();

        // A masked value coming back from the form means "leave it alone".
        if (testKeySecret && !testKeySecret.includes('•')) settings.testKeySecret = String(testKeySecret).trim();
        if (liveKeySecret && !liveKeySecret.includes('•')) settings.liveKeySecret = String(liveKeySecret).trim();

        await settings.save();
        res.json({ message: 'Settings updated successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
