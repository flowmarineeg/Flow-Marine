'use strict';

const mongoose = require('mongoose');
const logger   = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,   // fail fast if Mongo unreachable
      socketTimeoutMS:          45000,  // drop idle sockets after 45s
      maxPoolSize:              10,     // max concurrent connections
      minPoolSize:              2,      // keep at least 2 warm
    });
    logger.info(`[DB] MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error(`[DB] Connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
