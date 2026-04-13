const mongoose = require('mongoose');

const videoSchema = mongoose.Schema({
    videoUrl: { type: String, required: true },
    title: { type: String, required: true },
    productLink: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }
}, {
    timestamps: true
});

const Video = mongoose.model('Video', videoSchema);

module.exports = Video;
