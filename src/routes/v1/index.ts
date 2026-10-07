import { Router } from "express";
import healthRouter from "./health.routes.js";
import authRouter from "./auth.routes.js";
import meRouter from "./me.routes.js";
import businessRouter from "./business.routes.js";

const router = Router();

// Mount routes
router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/me", meRouter);
router.use("/business", businessRouter);

export default router;
