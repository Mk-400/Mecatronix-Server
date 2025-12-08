// utils/logger.js
import winston from "winston";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Resolve __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const logDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(
    ({ level, message, timestamp }) => `${timestamp} [${level.toUpperCase()}]: ${message}`
  )
);

// Create logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === "development" ? "debug" : process.env.LOG_LEVEL || "info",   
  format: logFormat,
  transports: [
    new winston.transports.File({ filename: path.join(logDir, "error.log"), level: "error" }),
    new winston.transports.File({ filename: path.join(logDir, "combined.log") }),
  ],
});

// Add colorized console logs only in development
if (process.env.NODE_ENV === "development") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// Handle uncaught exceptions & rejections
logger.exceptions.handle(
  new winston.transports.File({ filename: path.join(logDir, "exceptions.log") })
);

logger.rejections.handle(
  new winston.transports.File({ filename: path.join(logDir, "rejections.log") })
);

// Optionally handle uncaught rejections without crashing
process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

export default logger;
