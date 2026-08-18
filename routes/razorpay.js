const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const PaymentSettings = require('../models/PaymentSettings');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

const activeKeys = (settings) => {
    const isProduction = settings.environment === 'production';
    return {
        key_id: isProduction ? settings.liveKeyId : settings.testKeyId,
        key_secret: isProduction ? settings.liveKeySecret : settings.testKeySecret,
    };
};

const getRazorpayInstance = async () => {
    const settings = await PaymentSettings.findOne();
    if (!settings || !settings.isRazorpayEnabled) {
        throw Object.assign(new Error('Online payment is currently disabled.'), { status: 503 });
    }

    const { key_id, key_secret } = activeKeys(settings);
    if (!key_id || !key_secret) {
        console.error(`Razorpay [${settings.environment}] keys are missing in database settings.`);
        throw Object.assign(new Error('Online payment is not configured yet.'), { status: 503 });
    }

    return new Razorpay({ key_id, key_secret });
};

// @desc    Initiate a Razorpay order for an existing database order
// @route   POST /api/razorpay/create-order
// @access  Private
router.post('/create-order', protect, async (req, res, next) => {
    try {
        const { orderId } = req.body;

        // The amount is read from our own order document. Taking it from the
        // request body would let a client pay ₹1 for a ₹5000 basket.
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: 'Order not found.' });
        if (String(order.user) !== String(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized for this order.' });
        }
        if (order.isPaid) {
            return res.status(400).json({ message: 'This order is already paid.' });
        }

        const instance = await getRazorpayInstance();
        const razorpayOrder = await instance.orders.create({
            amount: Math.round(order.totalPrice * 100), // paise
            currency: 'INR',
            receipt: String(order._id),
            notes: { databaseOrderId: String(order._id) },
        });

        res.status(200).json({
            id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        next(error);
    }
});

// @desc    Verify a Razorpay payment signature and confirm the order
// @route   POST /api/razorpay/verify
// @access  Private
router.post('/verify', protect, async (req, res, next) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
            return res.status(400).json({ message: 'Incomplete payment details.' });
        }

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: 'Order not found.' });
        if (String(order.user) !== String(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized for this order.' });
        }
        if (order.isPaid) {
            return res.json({ success: true, message: 'Already confirmed.', order });
        }

        const settings = await PaymentSettings.findOne();
        const { key_secret } = activeKeys(settings || {});
        if (!key_secret) {
            return res.status(503).json({ message: 'Online payment is not configured.' });
        }

        const expectedSignature = crypto
            .createHmac('sha256', key_secret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        // timingSafeEqual needs equal-length buffers, hence the length guard.
        const provided = Buffer.from(String(razorpay_signature));
        const expected = Buffer.from(expectedSignature);
        const signatureValid =
            provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

        if (!signatureValid) {
            // Payment failed verification - put the reserved stock back.
            if (order.stockReserved) {
                for (const item of order.orderItems) {
                    await Product.updateOne({ _id: item.product }, { $inc: { countInStock: item.qty } }).catch(() => { });
                }
                order.stockReserved = false;
            }
            order.status = 'Rejected';
            await order.save();
            return res.status(400).json({ message: 'Payment could not be verified.', success: false });
        }

        order.isPaid = true;
        order.paidAt = new Date();
        order.status = 'Accepted';
        order.paymentResult = {
            id: razorpay_payment_id,
            status: 'paid',
            update_time: new Date().toISOString(),
            email_address: req.user.email,
        };
        await order.save();

        // The cart was deliberately kept until payment succeeded.
        await Cart.updateOne({ user: req.user._id }, { $set: { cartItems: [] } }).catch(() => { });

        res.status(200).json({ message: 'Payment verified successfully!', success: true, order });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
