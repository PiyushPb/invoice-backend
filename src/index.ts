import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { prisma, dbPool } from "./config/prisma.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  console.log(`Health check available at http://localhost:${config.port}/api/v1/health`);
});

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      await dbPool.end();
      console.log("Database connection pool cleanly closed.");
      process.exit(0);
    } catch (err) {
      console.error("Error during database disconnection:", err);
      process.exit(1);
    }
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("[Process Alert] Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Process Alert] Uncaught Exception:", error);
  process.exit(1);
});

