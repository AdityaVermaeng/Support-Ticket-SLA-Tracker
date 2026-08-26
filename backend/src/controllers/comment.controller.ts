import { Response } from "express";
import { CommentService } from "../services/comment.service.js";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";

export class CommentController {
  static async addComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const ticketId = req.params.id as string;
      const comment = await CommentService.addComment(
        ticketId,
        req.body.content,
        req.user
      );

      res.status(201).json({
        success: true,
        message: "Comment added successfully",
        data: comment,
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }

  static async getComments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const ticketId = req.params.id as string;
      const comments = await CommentService.getComments(ticketId, req.user);

      res.status(200).json({
        success: true,
        data: comments,
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
