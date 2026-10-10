import type { Request, Response, NextFunction } from "express";
import { ProductService } from "../services/product.service.js";
import type {
  CreateProductInput,
  ListProductsQuery,
  ProductIdParam,
  UpdateProductInput,
} from "../validators/product.validator.js";

export class ProductController {
  /**
   * POST /api/v1/products
   * Creates a new product/service. Enforces PRODUCTS_ACTIVE plan quota.
   */
  public static async createProduct(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const input = req.body as CreateProductInput;

      const product = await ProductService.createProduct(userId, input);

      res.status(201).json({
        success: true,
        message: "Product created successfully",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/products
   * Returns a paginated, filterable, sortable list of products.
   */
  public static async listProducts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const query = req.query as unknown as ListProductsQuery;

      const result = await ProductService.listProducts(userId, query);

      res.status(200).json({
        success: true,
        message: "Products retrieved successfully",
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/products/:productId
   * Returns a single product by ID.
   */
  public static async getProduct(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { productId } = req.params as unknown as ProductIdParam;

      const product = await ProductService.getProduct(userId, productId);

      res.status(200).json({
        success: true,
        message: "Product retrieved successfully",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/products/:productId
   * Updates mutable fields on an existing product.
   */
  public static async updateProduct(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { productId } = req.params as unknown as ProductIdParam;
      const input = req.body as UpdateProductInput;

      const product = await ProductService.updateProduct(
        userId,
        productId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Product updated successfully",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/products/:productId/archive
   * Soft-archives the product. Invoice history is preserved.
   */
  public static async archiveProduct(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { productId } = req.params as unknown as ProductIdParam;

      const product = await ProductService.archiveProduct(userId, productId);

      res.status(200).json({
        success: true,
        message: "Product archived successfully",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/products/:productId/restore
   * Restores an archived product back to ACTIVE status.
   * Re-enforces PRODUCTS_ACTIVE quota.
   */
  public static async restoreProduct(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { productId } = req.params as unknown as ProductIdParam;

      const product = await ProductService.restoreProduct(userId, productId);

      res.status(200).json({
        success: true,
        message: "Product restored successfully",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/products/:productId
   * Hard-deletes a product only when no invoice items reference it.
   * Returns 409 with a descriptive message if invoice items exist.
   * Requires OWNER or ADMIN role.
   */
  public static async deleteProduct(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { productId } = req.params as unknown as ProductIdParam;

      await ProductService.deleteProduct(userId, productId);

      res.status(200).json({
        success: true,
        message: "Product permanently deleted",
      });
    } catch (error) {
      next(error);
    }
  }
}
