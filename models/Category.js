const mongoose = require('mongoose');

const categorySchema = mongoose.Schema({
    name: { type: String, required: true, unique: true },
    image: { type: String, required: true },
    bgColor: { type: String, default: '#f3e8ff' },
    borderColor: { type: String, default: '#8E59A6' }
}, {
    timestamps: true
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
