const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const PaymentSettings = require('../models/PaymentSettings');
const Order = require('../models/Order'); // Importing existing Order model
const router = express.Router();

// Helper to get Razorpay instance with dynamic keys
const getRazorpayInstance = async () => {
    const settings = await PaymentSettings.findOne();
    if (!settings || !settings.isRazorpayEnabled) {
        throw new Error('Razorpay is currently disabled in administrator settings.');
    }

    const { environment, testKeyId, testKeySecret, liveKeyId, liveKeySecret } = settings;
    const key_id = environment === 'production' ? liveKeyId : testKeyId;
    const key_secret = environment === 'production' ? liveKeySecret : testKeySecret;

    if (!key_id || !key_secret) {
        console.error(`Razorpay [${environment}] keys are missing in database settings.`);
        throw new Error(`Razorpay ${environment} keys are not configured in Admin Dashboard.`);
    }

    return new Razorpay({ key_id, key_secret });
};

// @desc    Initiate Razorpay order
// @route   POST /api/razorpay/create-order
router.post('/create-order', async (req, res) => {
    const { amount, currency = 'INR', receipt } = req.body;

    try {
        const instance = await getRazorpayInstance();

        const options = {
            amount: amount * 100, // amount in the smallest currency unit (paise)
            currency,
            receipt: receipt || `order_rcpt_${Date.now()}`
        };

        const razorpayOrder = await instance.orders.create(options);
        res.status(200).json(razorpayOrder);
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Verify Razorpay payment signature
// @route   POST /api/razorpay/verify
router.post('/verify', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, database_order_id } = req.body;

    try {
        const settings = await PaymentSettings.findOne();
        const { environment, testKeySecret, liveKeySecret } = settings;
        const key_secret = environment === 'production' ? liveKeySecret : testKeySecret;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', key_secret)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            // Updated payment status in DB for existing order if needed
            if (database_order_id) {
                await Order.findByIdAndUpdate(database_order_id, {
                    isPaid: true,
                    paidAt: Date.now(),
                    paymentResult: {
                        id: razorpay_payment_id,
                        status: 'paid',
                        update_time: Date.now(),
                        email_address: req.body.email || ''
                    }
                });
            }
            res.status(200).json({ message: 'Payment verified successfully!', success: true });
        } else {
            res.status(400).json({ message: 'Invalid payment signature!', success: false });
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
