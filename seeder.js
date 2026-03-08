const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const User = require('./models/User');

dotenv.config();
connectDB();

const importData = async () => {
    try {
        // Check if admin already exists
        const adminExists = await User.findOne({ email: 'admin@ksjadu.com' });

        if (adminExists) {
            console.log('Admin user already exists!');
            process.exit();
        }

        const adminUser = {
            name: 'Admin User',
            email: 'admin@ksjadu.com',
            password: 'admin123', // Will be hashed by pre-save hook
            isAdmin: true
        };
 
        await User.create(adminUser);

        console.log('Admin User Created Successfully!');
        console.log('Email: admin@ksjadu.com');
        console.log('Password: admin123');

        process.exit();
    } catch (error) {
        console.error(`${error}`);
        process.exit(1);
    }
};

importData();
