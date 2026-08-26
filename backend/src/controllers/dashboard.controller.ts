import { Response } from "express";
import { DashboardService } from "../services/dashboard.service.js";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";

export class DashboardController {
  static async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const stats = await DashboardService.getDashboardStats(req.user);
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }
}
