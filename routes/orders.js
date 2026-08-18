const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const { protect, admin } = require('../middleware/authMiddleware');
const { invalidate } = require('../config/cache');

const { ORDER_STATUSES } = Order;

// Free delivery above this cart value; below it a flat fee applies.
const FREE_SHIPPING_THRESHOLD = Number(process.env.FREE_SHIPPING_THRESHOLD || 499);
const SHIPPING_FEE = Number(process.env.SHIPPING_FEE || 49);

/**
 * Rebuild the order from the database rather than trusting the client.
 *
 * The browser sends product ids and quantities; every price, name and image is
 * looked up server-side. Without this a user can post any totalPrice they like.
 */
const buildOrderItems = async (requestedItems) => {
    const ids = requestedItems.map((i) => i.product);

    if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
        throw Object.assign(new Error('One or more products are invalid.'), { status: 400 });
    }

    const products = await Product.find({ _id: { $in: ids } })
        .select('name image price sizes countInStock')
        .lean();

    const byId = new Map(products.map((p) => [p._id.toString(), p]));
    const orderItems = [];
    let itemsPrice = 0;

    for (const requested of requestedItems) {
        const product = byId.get(String(requested.product));
        if (!product) {
            throw Object.assign(new Error('A product in your order is no longer available.'), { status: 400 });
        }

        const qty = Math.floor(Number(requested.qty));
        if (!Number.isFinite(qty) || qty < 1) {
            throw Object.assign(new Error(`Invalid quantity for ${product.name}.`), { status: 400 });
        }

        // A size variant carries its own price; otherwise use the base price.
        let unitPrice = product.price;
        let sizeLabel;
        if (requested.size && Array.isArray(product.sizes) && product.sizes.length) {
            const variant = product.sizes.find((s) => s.size === requested.size);
            if (!variant) {
                throw Object.assign(new Error(`Size ${requested.size} is unavailable for ${product.name}.`), { status: 400 });
            }
            unitPrice = variant.price;
            sizeLabel = variant.size;
        }

        if (product.countInStock < qty) {
            throw Object.assign(
                new Error(
                    product.countInStock === 0
                        ? `${product.name} is out of stock.`
                        : `Only ${product.countInStock} left of ${product.name}.`
                ),
                { status: 409 }
            );
        }

        itemsPrice += unitPrice * qty;
        orderItems.push({
            product: product._id,
            name: product.name,
            image: product.image,
            price: unitPrice,
            qty,
            size: sizeLabel,
        });
    }

    const shippingPrice = itemsPrice >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;

    return { orderItems, itemsPrice, shippingPrice, totalPrice: itemsPrice + shippingPrice };
};

/** Take reserved quantities back off the shelf, refusing to oversell. */
const reserveStock = async (orderItems) => {
    const applied = [];
    try {
        for (const item of orderItems) {
            const result = await Product.updateOne(
                { _id: item.product, countInStock: { $gte: item.qty } },
                { $inc: { countInStock: -item.qty } }
            );
            if (result.modifiedCount !== 1) {
                throw Object.assign(new Error(`${item.name} just went out of stock.`), { status: 409 });
            }
            applied.push(item);
        }
    } catch (err) {
        // Put back whatever we already took so a partial failure leaves no hole.
        for (const item of applied) {
            await Product.updateOne({ _id: item.product }, { $inc: { countInStock: item.qty } }).catch(() => { });
        }
        throw err;
    }
};

const releaseStock = async (orderItems) => {
    for (const item of orderItems) {
        await Product.updateOne({ _id: item.product }, { $inc: { countInStock: item.qty } }).catch(() => { });
    }
};

// lean() skips virtuals, so attach the human-facing reference by hand.
const withOrderNumber = (order) =>
    order && { ...order, orderNumber: `KJ${String(order._id).slice(-8).toUpperCase()}` };

const validateAddress = (address) => {
    if (!address || typeof address !== 'object') return 'Shipping address is required.';
    const { address: street, city, postalCode, phone } = address;
    if (!street || !String(street).trim()) return 'Street address is required.';
    if (!city || !String(city).trim()) return 'City is required.';
    if (!/^\d{6}$/.test(String(postalCode || '').trim())) return 'PIN code must be 6 digits.';
    if (!/^[6-9]\d{9}$/.test(String(phone || '').replace(/\D/g, ''))) {
        return 'Enter a valid 10-digit Indian mobile number.';
    }
    return null;
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
router.post('/', protect, async (req, res, next) => {
    try {
        const { orderItems, shippingAddress, paymentMethod } = req.body;

        if (!Array.isArray(orderItems) || orderItems.length === 0) {
            return res.status(400).json({ message: 'Your order has no items.' });
        }
        if (orderItems.length > 50) {
            return res.status(400).json({ message: 'Too many items in a single order.' });
        }

        const addressError = validateAddress(shippingAddress);
        if (addressError) return res.status(400).json({ message: addressError });

        const method = String(paymentMethod || 'cod').toLowerCase();
        if (!['cod', 'online'].includes(method)) {
            return res.status(400).json({ message: 'Unsupported payment method.' });
        }

        const priced = await buildOrderItems(orderItems);
        await reserveStock(priced.orderItems);

        let order;
        try {
            order = await Order.create({
                user: req.user._id,
                orderItems: priced.orderItems,
                shippingAddress: {
                    fullName: shippingAddress.fullName || req.user.name,
                    address: String(shippingAddress.address).trim(),
                    city: String(shippingAddress.city).trim(),
                    postalCode: String(shippingAddress.postalCode).trim(),
                    phone: String(shippingAddress.phone).replace(/\D/g, ''),
                },
                itemsPrice: priced.itemsPrice,
                shippingPrice: priced.shippingPrice,
                totalPrice: priced.totalPrice,
                paymentMethod: method,
                // An online order is only confirmed once payment is verified.
                status: method === 'online' ? 'Pending' : 'Accepted',
                isPaid: false,
                stockReserved: true,
            });
        } catch (err) {
            await releaseStock(priced.orderItems);
            throw err;
        }

        // COD orders are complete at this point, so the cart can be emptied.
        // Online orders keep the cart until payment succeeds.
        if (method === 'cod') {
            await Cart.updateOne({ user: req.user._id }, { $set: { cartItems: [] } }).catch(() => { });
        }

        await invalidate('products');
        res.status(201).json(order);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        next(error);
    }
});

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
router.get('/myorders', protect, async (req, res, next) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const page = Math.max(Number(req.query.page) || 1, 1);

        const [orders, total] = await Promise.all([
            Order.find({ user: req.user._id })
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Order.countDocuments({ user: req.user._id }),
        ]);

        res.json({ orders: orders.map(withOrderNumber), page, pages: Math.ceil(total / limit), total });
    } catch (error) {
        next(error);
    }
});

// @desc    Get a single order (owner or admin)
// @route   GET /api/orders/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid order id.' });
        }
        const order = await Order.findById(req.params.id).lean();
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // Without this check any logged-in user could read anyone's address.
        if (String(order.user) !== String(req.user._id) && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Not authorized to view this order.' });
        }
        res.json(withOrderNumber(order));
    } catch (error) {
        next(error);
    }
});

// @desc    Cancel own order (only before it ships)
// @route   PUT /api/orders/:id/cancel
// @access  Private
router.put('/:id/cancel', protect, async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (String(order.user) !== String(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized to cancel this order.' });
        }
        if (!['Pending', 'Accepted'].includes(order.status)) {
            return res.status(400).json({ message: `An order that is ${order.status.toLowerCase()} cannot be cancelled.` });
        }

        if (order.stockReserved) {
            await releaseStock(order.orderItems);
            order.stockReserved = false;
        }
        order.status = 'Cancelled';
        await order.save();
        await invalidate('products');

        res.json(order);
    } catch (error) {
        next(error);
    }
});

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
router.get('/', protect, admin, async (req, res, next) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const page = Math.max(Number(req.query.page) || 1, 1);
        const filter = req.query.status ? { status: req.query.status } : {};

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .populate('user', 'id name email')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Order.countDocuments(filter),
        ]);

        res.json({ orders: orders.map(withOrderNumber), page, pages: Math.ceil(total / limit), total });
    } catch (error) {
        next(error);
    }
});

// @desc    Update order status (Accept/Reject/Ship/Deliver)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
router.put('/:id/status', protect, admin, async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!ORDER_STATUSES.includes(status)) {
            return res.status(400).json({ message: `Status must be one of: ${ORDER_STATUSES.join(', ')}` });
        }

        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // Rejecting or cancelling returns the goods to stock, exactly once.
        const returnsStock = ['Rejected', 'Cancelled'].includes(status);
        if (returnsStock && order.stockReserved) {
            await releaseStock(order.orderItems);
            order.stockReserved = false;
            await invalidate('products');
        }

        order.status = status;
        const updatedOrder = await order.save();
        res.json(updatedOrder);
    } catch (error) {
        next(error);
    }
});

// @desc    Update order tracking info
// @route   PUT /api/orders/:id/track
// @access  Private/Admin
router.put('/:id/track', protect, admin, async (req, res, next) => {
    try {
        const { shippingDate, deliveryDate, deliveryTime, details } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        order.tracking = { shippingDate, deliveryDate, deliveryTime, details };
        const updatedOrder = await order.save();
        res.json(updatedOrder);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
