const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const { protect } = require('../middleware/authMiddleware');

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        let cart = await Cart.findOne({ user: req.user._id });
        if (!cart) {
            cart = await Cart.create({ user: req.user._id, cartItems: [] });
        }
        res.json(cart.cartItems);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
router.post('/', protect, async (req, res) => {
    const { product, name, image, price, originalPrice, qty } = req.body;

    try {
        let cart = await Cart.findOne({ user: req.user._id });

        if (!cart) {
            cart = new Cart({ user: req.user._id, cartItems: [] });
        }

        const itemIndex = cart.cartItems.findIndex(item => item.product.toString() === product);

        if (itemIndex > -1) {
            cart.cartItems[itemIndex].qty += qty;
        } else {
            cart.cartItems.push({ product, name, image, price, originalPrice, qty });
        }

        const updatedCart = await cart.save();
        res.status(201).json(updatedCart.cartItems);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Update cart item quantity
// @route   PUT /api/cart/:id
// @access  Private
router.put('/:id', protect, async (req, res) => {
    const { qty } = req.body;

    try {
        const cart = await Cart.findOne({ user: req.user._id });

        if (cart) {
            const itemIndex = cart.cartItems.findIndex(item => item.product.toString() === req.params.id);
            if (itemIndex > -1) {
                cart.cartItems[itemIndex].qty = qty;
                await cart.save();
                res.json(cart.cartItems);
            } else {
                res.status(404).json({ message: 'Item not found in cart' });
            }
        } else {
            res.status(404).json({ message: 'Cart not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const cart = await Cart.findOne({ user: req.user._id });

        if (cart) {
            cart.cartItems = cart.cartItems.filter(item => item.product.toString() !== req.params.id);
            await cart.save();
            res.json(cart.cartItems);
        } else {
            res.status(404).json({ message: 'Cart not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
router.delete('/', protect, async (req, res) => {
    try {
        const cart = await Cart.findOne({ user: req.user._id });
        if (cart) {
            cart.cartItems = [];
            await cart.save();
        }
        res.json({ message: 'Cart cleared' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
