const mongoose = require('mongoose');

const reviewSchema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    name: { type: String, required: true },
    title: { type: String, required: false }, // Catchy headline for the review
    rating: { type: Number, required: true },
    comment: { type: String, required: true },
    images: { type: [String], default: [] }
}, {
    timestamps: true
});

const productSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    brand: {
        type: String,
        required: true,
        default: "K'S JADU"
    },
    category: {
        type: String,
        required: true,
        default: 'Cleaning'
    },
    description: {
        type: String,
        required: true,
        default: ''
    },
    rating: {
        type: Number,
        required: true,
        default: 0
    },
    numReviews: {
        type: Number,
        required: true,
        default: 0
    },
    price: {
        type: Number,
        required: true,
        default: 0
    },
    countInStock: {
        type: Number,
        required: true,
        default: 0
    },
    bulletPoints: {
        type: [String],
        default: []
    },
    sizes: [{
        label: { type: String },
        size: { type: String, required: true },
        price: { type: Number, required: true },
        originalPrice: { type: Number },
        image: { type: String } // Image for this specific variant
    }],
    additionalImages: {
        type: [String],
        default: []
    },
    overview: {
        type: String,
        default: ''
    },
    howToUse: {
        type: String,
        default: ''
    },
    reviews: [reviewSchema],
    displaySection: {
        type: String,
        enum: ['none', 'moms_favorite', 'new_launch', 'mega_saver', 'super_saver_refills'],
        default: 'none'
    }
}, {
    timestamps: true
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
