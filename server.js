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

// Connect to Database on Startup
connectDB();

// Middleware
app.use(cors({
    origin: true, // Reflect request origin
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Manual CORS preflight handling for Netlify/Vercel edge cases
app.options('*', cors());
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global Error Handler:', err.stack);
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports.handler = serverless(app);
