const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const productRoutes = require('./routes/products');
const bannerRoutes = require('./routes/banner');
const orderRoutes = require('./routes/orders');
const cartRoutes = require('./routes/cart');
const contactRoutes = require('./routes/contact');
const policyRoutes = require('./routes/policy');
const announcementRoutes = require('./routes/announcement');
const videoRoutes = require('./routes/videos');
const concernRoutes = require('./routes/concerns');
const razorpayRoutes = require('./routes/razorpay');
const paymentSettingsRoutes = require('./routes/payment_settings');
const categoryRoutes = require('./routes/categories');

// Load environment variables
dotenv.config();

const app = express();

// Middleware to ensure DB is connected
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error('Database Connection error in middleware:', err.message);
        res.status(500).json({
            message: 'Database connection failed',
            details: err.message,
            tip: 'Check if IP 0.0.0.0/0 is whitelisted in Atlas and MONGO_URI is correct'
        });
    }
});

// Middleware
app.use(cors({
    origin: '*', // Allow all origins (standard for public APIs)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); // Body parser
// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/concerns', concernRoutes);
app.use('/api/razorpay', razorpayRoutes);
app.use('/api/payment_settings', paymentSettingsRoutes);
app.use('/api/categories', categoryRoutes);

// Make uploads folder static
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

// Base route
app.get('/', (req, res) => {
    res.send('API is running...');
});

// Health Check Route
app.get('/api/health', (req, res) => {
    const state = mongoose.connection.readyState;
    const states = {
        0: "Disconnected",
        1: "Connected",
        2: "Connecting",
        3: "Disconnecting"
    };
    res.json({
        status: "Backend is running",
        database: states[state],
        timestamp: new Date()
    });
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports.handler = serverless(app);
