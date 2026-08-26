import { Response } from "express";
import { TicketService } from "../services/ticket.service.js";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { TicketPriority, TicketStatus } from "@prisma/client";

export class TicketController {
  static async createTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const ticket = await TicketService.createTicket({
        title: req.body.title,
        description: req.body.description,
        priority: req.body.priority,
        createdById: req.user.id,
      });

      res.status(201).json({
        success: true,
        message: "Ticket created successfully",
        data: ticket,
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }

  static async listTickets(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const options = {
        status: req.query.status as TicketStatus | undefined,
        priority: req.query.priority as TicketPriority | undefined,
        assignedToId: req.query.assignedToId as string | undefined,
        createdById: req.query.createdById as string | undefined,
        slaState: req.query.slaState as "ON_TRACK" | "AT_RISK" | "BREACHED" | undefined,
        search: req.query.search as string | undefined,
        take: req.query.take ? parseInt(req.query.take as string, 10) : 10,
        cursor: req.query.cursor as string | undefined,
      };

      const result = await TicketService.listTickets(options, req.user);

      res.status(200).json({
        success: true,
        data: result.nodes,
        pageInfo: result.pageInfo,
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }

  static async getTicketById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const ticket = await TicketService.getTicketById(req.params.id as string, req.user);
      res.status(200).json({
        success: true,
        data: ticket,
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }

  static async updateTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const updated = await TicketService.updateTicket(
        req.params.id as string,
        req.body,
        req.user
      );
      res.status(200).json({
        success: true,
        message: "Ticket updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }

  static async deleteTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await TicketService.deleteTicket(req.params.id as string);
      res.status(200).json({
        success: true,
        message: "Ticket deleted successfully",
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
