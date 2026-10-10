import { Router } from "express";
import { ProductController } from "../../controllers/product.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validate.js";
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdParamSchema,
  updateProductSchema,
} from "../../validators/product.validator.js";

const router = Router();

// All product routes require JWT authentication
router.use(authenticate);

// ============================================================
// Products / Services
// ============================================================

// POST /api/v1/products
router.post(
  "/",
  validateBody(createProductSchema),
  ProductController.createProduct
);

// GET /api/v1/products
router.get(
  "/",
  validateQuery(listProductsQuerySchema),
  ProductController.listProducts
);

// GET /api/v1/products/:productId
router.get(
  "/:productId",
  validateParams(productIdParamSchema),
  ProductController.getProduct
);

// PATCH /api/v1/products/:productId
router.patch(
  "/:productId",
  validateParams(productIdParamSchema),
  validateBody(updateProductSchema),
  ProductController.updateProduct
);

// POST /api/v1/products/:productId/archive
router.post(
  "/:productId/archive",
  validateParams(productIdParamSchema),
  ProductController.archiveProduct
);

// POST /api/v1/products/:productId/restore
router.post(
  "/:productId/restore",
  validateParams(productIdParamSchema),
  ProductController.restoreProduct
);

// DELETE /api/v1/products/:productId
router.delete(
  "/:productId",
  validateParams(productIdParamSchema),
  ProductController.deleteProduct
);

export default router;
