import { Router } from "express";
import healthRouter from "./health.routes.js";
import authRouter from "./auth.routes.js";
import meRouter from "./me.routes.js";
import businessRouter from "./business.routes.js";
import customerRouter from "./customer.routes.js";
import productRouter from "./product.routes.js";
import invoiceRouter from "./invoice.routes.js";
import dashboardRouter from "./dashboard.routes.js";
import usageRouter from "./usage.routes.js";
import entitlementsRouter from "./entitlements.routes.js";

const router = Router();

// Mount routes
router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/me", meRouter);
router.use("/business", businessRouter);
router.use("/customers", customerRouter);
router.use("/products", productRouter);
router.use("/invoices", invoiceRouter);
router.use("/dashboard", dashboardRouter);
router.use("/usage", usageRouter);
router.use("/entitlements", entitlementsRouter);

export default router;

