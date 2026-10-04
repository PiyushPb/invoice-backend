import { Router } from "express";
import healthRouter from "./health.routes.js";
import authRouter from "./auth.routes.js";
import meRouter from "./me.routes.js";

const router = Router();

// Mount routes
router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/me", meRouter);

export default router;
