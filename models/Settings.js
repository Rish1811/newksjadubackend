const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    razorpayEnabled: {
        type: Boolean,
        default: false
    },
    razorpayEnvironment: {
        type: String,
        enum: ['test', 'live'],
        default: 'test'
    },
    razorpayTestKey: {
        type: String,
        default: ''
    },
    razorpayTestSecret: {
        type: String,
        default: ''
    },
    razorpayLiveKey: {
        type: String,
        default: ''
    },
    razorpayLiveSecret: {
        type: String,
        default: ''
    }
}, { timestamps: true });

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
