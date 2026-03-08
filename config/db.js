const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
    if (isConnected) {
        return;
    }

    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI is not defined in environment variables');
        }

        // Add options for faster failure and better error messages
        const options = {
            serverSelectionTimeoutMS: 5000, // 5 seconds instead of 10
            family: 4 // Use IPv4
        };

        const conn = await mongoose.connect(process.env.MONGO_URI, options);
        isConnected = true;
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`MongoDB Connection Error: ${error.message}`);
        throw error; // Rethrow to let the caller handle it
    }
};

module.exports = connectDB;
