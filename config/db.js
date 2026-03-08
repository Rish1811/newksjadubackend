const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
    if (isConnected) {
        console.log('MongoDB is already connected');
        return;
    }

    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        isConnected = true;
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`MongoDB Connection Error: ${error.message}`);
        // In serverless, we shouldn't exit the process. Just log it.
        // If a route needs the database, it will fail naturally when trying to query.
    }
};

module.exports = connectDB;
