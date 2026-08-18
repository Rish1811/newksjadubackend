const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { protect } = require('../middleware/authMiddleware');

const MAX_QTY_PER_ITEM = 20;

/**
 * Resolve a cart line from the database.
 *
 * Name, image and price always come from the Product document, never from the
 * request body - otherwise anyone could add a ₹1 version of any product.
 */
const resolveLine = async (productId, size) => {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw Object.assign(new Error('Invalid product.'), { status: 400 });
    }

    const product = await Product.findById(productId)
        .select('name image price sizes countInStock')
        .lean();

    if (!product) {
        throw Object.assign(new Error('Product not found.'), { status: 404 });
    }

    let price = product.price;
    let originalPrice;
    let image = product.image;
    let resolvedSize;

    if (Array.isArray(product.sizes) && product.sizes.length) {
        const variant = size
            ? product.sizes.find((s) => s.size === size)
            : product.sizes[0];

        if (!variant) {
            throw Object.assign(new Error('That size is not available.'), { status: 400 });
        }
        price = variant.price;
        originalPrice = variant.originalPrice;
        resolvedSize = variant.size;
        if (variant.image) image = variant.image;
    }

    return { product, price, originalPrice, image, size: resolvedSize };
};

const getOrCreateCart = async (userId) => {
    let cart = await Cart.findOne({ user: userId });
    if (!cart) cart = new Cart({ user: userId, cartItems: [] });
    return cart;
};

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
router.get('/', protect, async (req, res, next) => {
    try {
        const cart = await Cart.findOne({ user: req.user._id }).lean();
        res.json(cart ? cart.cartItems : []);
    } catch (error) {
        next(error);
    }
});

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
router.post('/', protect, async (req, res, next) => {
    try {
        const { product: productId, qty, size } = req.body;

        const requestedQty = Math.floor(Number(qty ?? 1));
        if (!Number.isFinite(requestedQty) || requestedQty < 1) {
            return res.status(400).json({ message: 'Quantity must be at least 1.' });
        }

        const line = await resolveLine(productId, size);
        const cart = await getOrCreateCart(req.user._id);

        // Same product in a different size is a separate cart line.
        const index = cart.cartItems.findIndex(
            (item) => String(item.product) === String(line.product._id) && (item.size || '') === (line.size || '')
        );

        const currentQty = index > -1 ? cart.cartItems[index].qty : 0;
        const newQty = Math.min(currentQty + requestedQty, MAX_QTY_PER_ITEM);

        if (line.product.countInStock < newQty) {
            return res.status(409).json({
                message:
                    line.product.countInStock === 0
                        ? `${line.product.name} is out of stock.`
                        : `Only ${line.product.countInStock} left in stock.`,
            });
        }

        if (index > -1) {
            cart.cartItems[index].qty = newQty;
            cart.cartItems[index].price = line.price; // pick up price changes
        } else {
            cart.cartItems.push({
                product: line.product._id,
                name: line.product.name,
                image: line.image,
                price: line.price,
                originalPrice: line.originalPrice,
                size: line.size,
                qty: newQty,
            });
        }

        const updatedCart = await cart.save();
        res.status(201).json(updatedCart.cartItems);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        next(error);
    }
});

// @desc    Update cart item quantity
// @route   PUT /api/cart/:id
// @access  Private
router.put('/:id', protect, async (req, res, next) => {
    try {
        const qty = Math.floor(Number(req.body.qty));
        if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
            return res.status(400).json({ message: `Quantity must be between 1 and ${MAX_QTY_PER_ITEM}.` });
        }

        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart) return res.status(404).json({ message: 'Cart not found' });

        const size = req.body.size;
        const index = cart.cartItems.findIndex(
            (item) => String(item.product) === req.params.id && (size === undefined || (item.size || '') === (size || ''))
        );
        if (index === -1) return res.status(404).json({ message: 'Item not found in cart' });

        const stock = await Product.findById(req.params.id).select('countInStock name').lean();
        if (stock && stock.countInStock < qty) {
            return res.status(409).json({ message: `Only ${stock.countInStock} left in stock.` });
        }

        cart.cartItems[index].qty = qty;
        await cart.save();
        res.json(cart.cartItems);
    } catch (error) {
        next(error);
    }
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:id
// @access  Private
router.delete('/:id', protect, async (req, res, next) => {
    try {
        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart) return res.status(404).json({ message: 'Cart not found' });

        const before = cart.cartItems.length;
        cart.cartItems = cart.cartItems.filter((item) => String(item.product) !== req.params.id);
        if (cart.cartItems.length === before) {
            return res.status(404).json({ message: 'Item not found in cart' });
        }

        await cart.save();
        res.json(cart.cartItems);
    } catch (error) {
        next(error);
    }
});

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
router.delete('/', protect, async (req, res, next) => {
    try {
        await Cart.updateOne({ user: req.user._id }, { $set: { cartItems: [] } });
        res.json({ message: 'Cart cleared', cartItems: [] });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
