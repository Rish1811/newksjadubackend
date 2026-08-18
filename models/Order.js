const mongoose = require('mongoose');

const ORDER_STATUSES = ['Pending', 'Accepted', 'Shipped', 'Delivered', 'Rejected', 'Cancelled'];
const PAYMENT_METHODS = ['cod', 'online'];

const orderSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    orderItems: [
        {
            name: { type: String, required: true },
            qty: { type: Number, required: true, min: 1 },
            image: { type: String, required: true },
            price: { type: Number, required: true, min: 0 },
            size: { type: String },
            product: {
                type: mongoose.Schema.Types.ObjectId,
                required: true,
                ref: 'Product'
            },
        }
    ],
    shippingAddress: {
        fullName: { type: String },
        address: { type: String, required: true },
        city: { type: String, required: true },
        postalCode: { type: String, required: true },
        phone: { type: String, required: true },
    },
    paymentMethod: {
        type: String,
        required: true,
        // Legacy rows stored 'COD'; lowercasing keeps them valid on re-save.
        lowercase: true,
        trim: true,
        enum: PAYMENT_METHODS,
        default: 'cod'
    },
    // Price breakdown is stored so a later change to shipping rules never
    // rewrites the history of an order that has already been placed.
    itemsPrice: { type: Number, required: true, default: 0 },
    shippingPrice: { type: Number, required: true, default: 0 },
    totalPrice: {
        type: Number,
        required: true,
        default: 0.0
    },
    status: {
        type: String,
        required: true,
        enum: ORDER_STATUSES,
        default: 'Pending',
    },
    tracking: {
        shippingDate: { type: String },
        deliveryDate: { type: String },
        deliveryTime: { type: String },
        details: { type: String },
    },
    isPaid: {
        type: Boolean,
        required: true,
        default: false,
    },
    paidAt: {
        type: Date,
    },
    paymentResult: {
        id: { type: String },
        status: { type: String },
        update_time: { type: String },
        email_address: { type: String },
    },
    // Set to true once stock has been taken off the shelf, so a retried
    // request can never decrement the same order's stock twice.
    stockReserved: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true
});

orderSchema.index({ user: 1, createdAt: -1 }); // "my orders"
orderSchema.index({ createdAt: -1 });          // admin list
orderSchema.index({ status: 1 });

// Short, human-quotable reference derived from the ObjectId.
orderSchema.virtual('orderNumber').get(function () {
    return `KJ${this._id.toString().slice(-8).toUpperCase()}`;
});

orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
