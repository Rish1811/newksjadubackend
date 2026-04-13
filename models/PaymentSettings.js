const mongoose = require('mongoose');

const paymentSettingsSchema = new mongoose.Schema({
    isRazorpayEnabled: {
        type: Boolean,
        default: false
    },
    environment: {
        type: String,
        enum: ['test', 'production'],
        default: 'test'
    },
    testKeyId: {
        type: String,
        default: ''
    },
    testKeySecret: {
        type: String,
        default: ''
    },
    liveKeyId: {
        type: String,
        default: ''
    },
    liveKeySecret: {
        type: String,
        default: ''
    },
}, { timestamps: true });

module.exports = mongoose.model('PaymentSettings', paymentSettingsSchema);
