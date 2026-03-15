const mongoose = require('mongoose');

const reviewSchema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    name: { type: String, required: true },
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
        image: { type: String }
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
    reviews: [reviewSchema]
}, {
    timestamps: true
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
