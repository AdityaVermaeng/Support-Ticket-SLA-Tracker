import { Request, Response } from "express";
import { AuthService } from "../services/auth.service.js";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { UserRole } from "@prisma/client";

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const result = await AuthService.register(req.body);
      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: result,
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const result = await AuthService.login(req.body);
      res.status(200).json({
        success: true,
        message: "Login successful",
        data: result,
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }

  static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const user = await AuthService.getMe(req.user.id);
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }

  static async getUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const role = req.query.role as UserRole | undefined;
      const users = await AuthService.getUsers(role);
      res.status(200).json({
        success: true,
        data: users,
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }
}
