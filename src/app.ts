import express, { type Application } from "express";
import cors from "cors";
import apiRouter from "./routes/index.js";
import { notFoundHandler } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";

export function createApp(): Application {
  const app = express();

  // Trust first proxy hop (e.g. AWS ALB, Nginx, Cloudflare, Docker)
  app.set("trust proxy", 1);

  // Hide server fingerprinting
  app.disable("x-powered-by");

  // Essential HTTP Security Response Headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // CORS Configuration
  const allowedOrigins = process.env["CORS_ORIGIN"]
    ? process.env["CORS_ORIGIN"].split(",").map((o) => o.trim())
    : "*";

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-business-id",
        "x-device-name",
        "Accept",
      ],
      maxAge: 86400,
    })
  );

  // Safe body parsing with explicit payload size boundaries
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // API Routes mounted under /api
  app.use("/api", apiRouter);

  // 404 & Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
