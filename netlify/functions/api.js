// netlify/functions/api.js
// This is the entry point for Netlify Serverless Functions.
// It imports the Express app (already wrapped with serverless-http) from server.js.

const { handler } = require('../../server');

exports.handler = async (event, context) => {
    // Standard handler execution
    return await handler(event, context);
};
