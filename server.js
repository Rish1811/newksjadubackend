const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const serverless = require('serverless-http');
const mongoose = require('mongoose');

// Load environment variables before anything reads them.
dotenv.config();

const connectDB = require('./config/db');
const { cache } = require('./config/cache');

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

const app = express();
const isServerless = Boolean(process.env.NETLIFY || process.env.VERCEL);

// Behind Netlify/Vercel/nginx the client IP arrives in X-Forwarded-For.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Connect to the database on startup. Locally we want a hard failure so the
// problem is obvious; on serverless we let individual requests retry.
connectDB().catch((err) => {
    console.error('Initial DB connection failed:', err.message);
    if (!isServerless) process.exit(1);
});

/* ------------------------------------------------------------------ *
 * Middleware
 * ------------------------------------------------------------------ */

// gzip/brotli every response over 1KB - the single biggest transfer win.
app.use(compression({ threshold: 1024 }));

app.use(
    helmet({
        // The API serves JSON and uploaded images to a separate origin.
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
);

// ALLOWED_ORIGINS is a comma-separated list. When unset (local dev) we reflect
// the request origin so any device on the LAN can talk to this server.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.length === 0) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new Error(`Origin ${origin} is not allowed by CORS`));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'If-None-Match'],
        exposedHeaders: ['ETag', 'X-Cache'],
        maxAge: 86400,
    })
);

// Only parse JSON for requests that actually declare it; multipart uploads and
// bodyless GET/DELETE calls skip the parser entirely.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Strip Mongo operators ($gt, $ne, ...) out of user input so a crafted body
// can't turn a findOne into a match-anything query.
app.use((req, res, next) => {
    const scrub = (value) => {
        if (!value || typeof value !== 'object') return;
        for (const key of Object.keys(value)) {
            if (key.startsWith('$') || key.includes('.')) {
                delete value[key];
            } else {
                scrub(value[key]);
            }
        }
    };
    scrub(req.body);
    scrub(req.query);
    scrub(req.params);
    next();
});

// Lightweight request log with timing, so slow endpoints are visible locally.
if (process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const ms = Date.now() - start;
            const cacheState = res.get('X-Cache') ? ` [${res.get('X-Cache')}]` : '';
            console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms${cacheState}`);
        });
        next();
    });
}

/* ------------------------------------------------------------------ *
 * Rate limiting
 * ------------------------------------------------------------------ */

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please slow down.' },
});

// Credential endpoints get a much tighter budget to blunt password guessing.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

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

// Locally-stored uploads (legacy records still point here).
app.use(
    '/uploads',
    express.static(path.join(__dirname, '/uploads'), {
        maxAge: '30d',
        immutable: true,
    })
);

app.get('/', (req, res) => {
    res.json({ status: 'ok', service: "K'S JADU API" });
});

app.get('/api/health', (req, res) => {
    const states = { 0: 'Disconnected', 1: 'Connected', 2: 'Connecting', 3: 'Disconnecting' };
    res.json({
        status: 'Backend is running',
        database: states[mongoose.connection.readyState],
        cache: cache.stats(),
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date(),
    });
});

/* ------------------------------------------------------------------ *
 * Error handling (must come after every route)
 * ------------------------------------------------------------------ */

app.use((req, res) => {
    res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
    // Multer rejects oversized or wrong-type uploads with its own codes.
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File is too large.' });
    }
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            message: Object.values(err.errors).map((e) => e.message).join(', '),
        });
    }
    if (err.name === 'CastError') {
        return res.status(400).json({ message: `Invalid ${err.path}: ${err.value}` });
    }

    const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
    console.error('Unhandled error:', err.stack || err.message);
    res.status(statusCode).json({
        message: err.message || 'Server error',
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
});

/* ------------------------------------------------------------------ *
 * Listen
 * ------------------------------------------------------------------ */

const PORT = process.env.PORT || 5000;
// 0.0.0.0 makes the API reachable from phones/other machines on the same Wi-Fi.
const HOST = process.env.HOST || '0.0.0.0';

if (!isServerless) {
    const server = app.listen(PORT, HOST, () => {
        console.log(`Server listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
        if (HOST === '0.0.0.0') {
            const nets = require('os').networkInterfaces();
            for (const addrs of Object.values(nets)) {
                for (const addr of addrs || []) {
                    if (addr.family === 'IPv4' && !addr.internal) {
                        console.log(`  LAN: http://${addr.address}:${PORT}`);
                    }
                }
            }
        }
    });

    const shutdown = (signal) => {
        console.log(`\n${signal} received, shutting down...`);
        server.close(() => {
            mongoose.connection.close(false).finally(() => process.exit(0));
        });
        setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;
module.exports.handler = serverless(app);
