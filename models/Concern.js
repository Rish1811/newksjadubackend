const mongoose = require('mongoose');

const concernSchema = mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    linkUrl: {
        type: String, // e.g., link to a specific category or search query
        required: false
    }
}, {
    timestamps: true
});

const Concern = mongoose.model('Concern', concernSchema);
module.exports = Concern;
