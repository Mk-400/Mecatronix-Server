// config/db.js
import mongoose from "mongoose";
import logger from "../utils/logger.js";

/**
 * 📌 Secure & Optimized MongoDB Connection (Atlas + DB Support)
 */
export const db_connection = async () => {
  // Validate required environment variables
  const required = ["DB_USER", "DB_PASS", "DB_CLUSTER", "DB_NAME"];
  for (const key of required) {
    if (!process.env[key]) {
      logger.error(`❌ Missing environment variable: ${key}`);
      process.exit(1);
    }
  }

  // Build Connection Strings
  const DEV_URI = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_CLUSTER}/${process.env.DB_NAME}?retryWrites=true&w=majority&appName=DB0001`;
  const PROD_URI = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_CLUSTER}/`;

  const dbUri = process.env.NODE_ENV === "production" ? PROD_URI : DEV_URI;

  // Safe logging
  logger.info("==============================================");
  logger.info(`🌍 Environment     : ${process.env.NODE_ENV}`);
  logger.info(`📁 Database Name   : ${process.env.DB_NAME}`);
  logger.info(
    `🔗 Cluster         : mongodb+srv://${process.env.DB_USER}:***@${process.env.DB_CLUSTER}`
  );
  logger.info("==============================================");

  try {
    // Connect to MongoDB
    const conn = await mongoose.connect(dbUri, {
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 5000,
    });

    logger.info(`✅ MongoDB Connected!`);
    logger.info(`📌 Host: ${conn.connection.host}`);
    logger.info(`📊 Active DB: ${conn.connection.name}`);

    // Connection Events
    mongoose.connection.on("disconnected", () => {
      logger.warn("⚠️ MongoDB Disconnected!");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("🔄 MongoDB Reconnected!");
    });

    mongoose.connection.on("error", (err) => {
      logger.error(`❌ MongoDB Error: ${err.message}`);
    });

    // Graceful exit handler
    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      logger.info("🔌 MongoDB connection closed (App terminated)");
      process.exit(0);
    });
  } catch (err) {
    logger.error("🚨 MongoDB Initial Connection Failed");
    logger.error(`❗ Error: ${err.message}`);

    if (err.message.includes("bad auth")) {
      logger.error("❌ Authentication failed → Incorrect DB_USER or DB_PASS");
    }

    if (err.message.includes("ENOTFOUND") || err.message.includes("querySrv")) {
      logger.error("❌ DNS Resolution Failed → Incorrect DB_CLUSTER format");
      logger.error(
        "💡 Example Correct Format: cluster0.xxxxxx.mongodb.net (no extra mongodb.net)"
      );
      process.exit(1);
    }

    if (err.name === "MongoParseError") {
      logger.error("❌ URI Format Error → Invalid Connection String");
    }

    // Retry Logic
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const retryConnection = async () => {
      retryCount++;
      if (retryCount > MAX_RETRIES) {
        logger.error("❌ Max retries reached. Shutting down...");
        process.exit(1);
      }

      const delay = retryCount * 5000;
      logger.warn(`🔁 Retry ${retryCount}/${MAX_RETRIES} in ${delay}ms...`);

      setTimeout(async () => {
        try {
          await mongoose.connect(dbUri);
          logger.info("✅ MongoDB Connected Successfully on Retry!");
        } catch (retryErr) {
          logger.error(`❌ Retry ${retryCount} Failed: ${retryErr.message}`);
          retryConnection();
        }
      }, delay);
    };

    retryConnection();
  }
};

export default db_connection;
