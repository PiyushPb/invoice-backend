import express, { type Application } from "express";
import cors from "cors";
import apiRouter from "./routes/index.js";
import { notFoundHandler } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";

export function createApp(): Application {
  const app = express();

  // Hide server fingerprinting
  app.disable("x-powered-by");

  // Core Middlewares
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes mounted under /api
  app.use("/api", apiRouter);

  // 404 & Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
