const mongoose = require('mongoose');

let connectionPromise = null;

const connectDB = async () => {
    // Reuse the in-flight promise so concurrent callers (and warm serverless
    // invocations) never open a second connection.
    if (connectionPromise) return connectionPromise;

    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not defined in environment variables');
    }

    const options = {
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 45000,
        family: 4,
        // A pool means concurrent requests don't queue behind each other.
        maxPoolSize: 20,
        minPoolSize: 2,
        maxIdleTimeMS: 60000,
        // Reads don't need to wait for a round trip through the primary's oplog.
        retryWrites: true,
    };

    // Buffering hides connection problems behind 10s hangs; fail fast instead.
    mongoose.set('bufferCommands', false);
    mongoose.set('strictQuery', true);

    connectionPromise = mongoose
        .connect(process.env.MONGO_URI, options)
        .then((conn) => {
            console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
            return conn;
        })
        .catch((error) => {
            connectionPromise = null; // allow a retry on the next request
            console.error(`MongoDB connection error: ${error.message}`);
            throw error;
        });

    return connectionPromise;
};

mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
    connectionPromise = null;
});

module.exports = connectDB;
