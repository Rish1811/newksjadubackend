const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 8;

if (!process.env.JWT_SECRET) {
    console.warn('WARNING: JWT_SECRET is not set. Tokens will not be secure.');
}

const generateToken = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET || 'insecure-dev-secret', { expiresIn: '30d' });

const publicUser = (user) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    image: user.image,
    token: generateToken(user._id),
});

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', async (req, res, next) => {
    try {
        const name = String(req.body.name || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const { password, phone } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email and password are all required.' });
        }
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ message: 'Please enter a valid email address.' });
        }
        if (String(password).length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
        }
        if (phone && !/^[6-9]\d{9}$/.test(String(phone).replace(/\D/g, ''))) {
            return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number.' });
        }

        if (await User.exists({ email })) {
            return res.status(409).json({ message: 'An account with this email already exists.' });
        }

        const user = await User.create({
            name,
            email,
            password,
            phone: phone ? String(phone).replace(/\D/g, '') : undefined,
        });

        res.status(201).json(publicUser(user));
    } catch (error) {
        // Unique-index race: two registrations for the same email at once.
        if (error.code === 11000) {
            return res.status(409).json({ message: 'An account with this email already exists.' });
        }
        next(error);
    }
});

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res, next) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const { password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }

        const user = await User.findOne({ email });

        // One generic message for both cases, so this endpoint can't be used
        // to discover which email addresses have accounts.
        if (!user || !(await user.matchPassword(String(password)))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        res.json(publicUser(user));
    } catch (error) {
        next(error);
    }
});

// @desc    Social login (Google)
// @route   POST /api/auth/social-login
// @access  Public
router.post('/social-login', async (req, res, next) => {
    try {
        const { accessToken, provider = 'Google' } = req.body;

        if (!accessToken) {
            return res.status(400).json({ message: 'Missing Google access token.' });
        }

        // The profile is fetched from Google with the token rather than read
        // from the request body - otherwise anyone could post any email and
        // be handed a session for that account.
        const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!googleRes.ok) {
            return res.status(401).json({ message: 'Google sign-in could not be verified.' });
        }

        const profile = await googleRes.json();
        const email = String(profile.email || '').trim().toLowerCase();

        if (!email || profile.email_verified === false) {
            return res.status(401).json({ message: 'Google account email is not verified.' });
        }

        let user = await User.findOne({ email });

        if (user) {
            if (profile.name) user.name = profile.name;
            if (profile.picture) user.image = profile.picture;
            await user.save();
        } else {
            user = await User.create({
                name: profile.name || email.split('@')[0],
                email,
                // Social accounts never sign in with this; it exists only to
                // satisfy the schema and is cryptographically random.
                password: crypto.randomBytes(32).toString('hex'),
                image: profile.picture,
                isSocial: true,
                provider,
            });
        }

        res.json(publicUser(user));
    } catch (error) {
        next(error);
    }
});

module.exports = router;
