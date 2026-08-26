import { TicketPriority, TicketStatus, UserRole, Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { SlaService, SLA_POLICIES } from "./sla.service.js";

export interface CreateTicketDTO {
  title: string;
  description: string;
  priority: TicketPriority;
  createdById: string;
}

export interface UpdateTicketDTO {
  title?: string;
  description?: string;
  priority?: TicketPriority;
  status?: TicketStatus;
  assignedToId?: string | null;
}

export interface TicketFilterOptions {
  status?: TicketStatus | undefined;
  priority?: TicketPriority | undefined;
  assignedToId?: string | undefined;
  createdById?: string | undefined;
  slaState?: "ON_TRACK" | "AT_RISK" | "BREACHED" | undefined;
  search?: string | undefined;
  take?: number | undefined;
  cursor?: string | undefined;
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

export class TicketService {
  /**
   * Create a new ticket and compute its initial SLA deadline
   */
  static async createTicket(data: CreateTicketDTO, holidayList: string[] = []) {
    const { title, description, priority, createdById } = data;

    if (!title || !title.trim()) {
      throw { statusCode: 400, message: "Ticket title is required" };
    }
    if (!description || !description.trim()) {
      throw { statusCode: 400, message: "Ticket description is required" };
    }
    if (!priority || !Object.values(TicketPriority).includes(priority)) {
      throw { statusCode: 400, message: "Valid ticket priority is required" };
    }

    const now = new Date();
    const policy = SLA_POLICIES[priority];

    // Compute SLA resolution deadline
    const slaDeadline = SlaService.addBusinessMinutes(now, policy.resolutionMinutes, holidayList);

    const ticket = await prisma.ticket.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        priority,
        status: TicketStatus.OPEN,
        createdById,
        slaDeadline,
      },
      include: {
        createdBy: { select: userSelect },
        assignedTo: { select: userSelect },
      },
    });

    const sla = SlaService.getTicketSLAInfo(ticket, holidayList, now);

    return {
      ...ticket,
      comments: [] as Array<{ id: string; content: string; createdAt: Date; author: { id: string; name: string; email: string; role: UserRole } }>,
      sla,
    };
  }

  /**
   * List tickets with cursor-based pagination and filtering
   */
  static async listTickets(
    options: TicketFilterOptions,
    requestingUser?: { id: string; role: UserRole },
    holidayList: string[] = []
  ) {
    const { status, priority, assignedToId, createdById, slaState, search, take = 10, cursor } = options;

    const limit = Math.min(Math.max(1, Number(take) || 10), 50);

    const where: Prisma.TicketWhereInput = {};

    // Reporter can only view their own tickets unless AGENT or ADMIN
    if (requestingUser && requestingUser.role === UserRole.REPORTER) {
      where.createdById = requestingUser.id;
    } else if (createdById) {
      where.createdById = createdById;
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedToId) where.assignedToId = assignedToId;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const rawTickets = await prisma.ticket.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: userSelect },
        assignedTo: { select: userSelect },
      },
    });

    const hasNextPage = rawTickets.length > limit;
    const nodesRaw = hasNextPage ? rawTickets.slice(0, limit) : rawTickets;

    const now = new Date();
    let nodes = nodesRaw.map((t) => {
      const sla = SlaService.getTicketSLAInfo(t, holidayList, now);
      return {
        ...t,
        comments: [] as Array<{ id: string; content: string; createdAt: Date; author: { id: string; name: string; email: string; role: UserRole } }>,
        sla,
      };
    });

    // Filter by slaState if requested
    if (slaState) {
      nodes = nodes.filter((t) => t.sla.resolutionState === slaState || t.sla.firstResponseState === slaState);
    }

    const lastNode = nodes[nodes.length - 1];
    const endCursor = lastNode ? lastNode.id : null;

    return {
      nodes,
      pageInfo: {
        hasNextPage,
        endCursor,
      },
    };
  }

  /**
   * Get single ticket by ID
   */
  static async getTicketById(
    id: string,
    requestingUser?: { id: string; role: UserRole },
    holidayList: string[] = []
  ) {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        createdBy: { select: userSelect },
        assignedTo: { select: userSelect },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: userSelect },
          },
        },
      },
    });

    if (!ticket) {
      throw { statusCode: 404, message: "Ticket not found" };
    }

    // Access control: REPORTER can only view their own ticket
    if (requestingUser && requestingUser.role === UserRole.REPORTER && ticket.createdById !== requestingUser.id) {
      throw { statusCode: 403, message: "Forbidden: You cannot view tickets created by other users" };
    }

    const now = new Date();
    const sla = SlaService.getTicketSLAInfo(ticket, holidayList, now);

    return {
      ...ticket,
      sla,
    };
  }

  /**
   * Update ticket fields and enforce status transition rules
   */
  static async updateTicket(
    id: string,
    data: UpdateTicketDTO,
    requestingUser: { id: string; role: UserRole },
    holidayList: string[] = []
  ) {
    const existingTicket = await prisma.ticket.findUnique({
      where: { id },
    });

    if (!existingTicket) {
      throw { statusCode: 404, message: "Ticket not found" };
    }

    // Access check: REPORTER can only update title/description of their own OPEN ticket
    if (requestingUser.role === UserRole.REPORTER) {
      if (existingTicket.createdById !== requestingUser.id) {
        throw { statusCode: 403, message: "Forbidden: Cannot update tickets of other users" };
      }
      if (data.status || data.assignedToId || data.priority) {
        throw {
          statusCode: 403,
          message: "Forbidden: Reporters cannot alter ticket status, priority, or assignee",
        };
      }
    }

    // Status transition validation
    if (data.status && data.status !== existingTicket.status) {
      const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
        [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CLOSED],
        [TicketStatus.IN_PROGRESS]: [TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.OPEN],
        [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
        [TicketStatus.CLOSED]: [TicketStatus.OPEN], // Must be explicitly reopened to OPEN
      };

      const validNext = allowedTransitions[existingTicket.status] ?? [];
      if (!validNext.includes(data.status)) {
        throw {
          statusCode: 400,
          message: `INVALID_STATUS_TRANSITION: Ticket cannot transition from ${existingTicket.status} to ${data.status}`,
        };
      }
    }

    // Assignee validation
    if (data.assignedToId) {
      const assignee = await prisma.user.findUnique({
        where: { id: data.assignedToId },
      });
      if (!assignee) {
        throw { statusCode: 404, message: "Assignee user not found" };
      }
      if (assignee.role === UserRole.REPORTER) {
        throw { statusCode: 400, message: "Cannot assign ticket to a REPORTER role user" };
      }
    }

    const updatePayload: Prisma.TicketUpdateInput = {};
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.priority !== undefined) updatePayload.priority = data.priority;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.assignedToId !== undefined) {
      if (data.assignedToId === null) {
        updatePayload.assignedTo = { disconnect: true };
      } else {
        updatePayload.assignedTo = { connect: { id: data.assignedToId } };
      }
    }

    // If status is updated to RESOLVED or CLOSED and resolvedAt is not set, freeze resolution SLA
    if (
      data.status &&
      (data.status === TicketStatus.RESOLVED || data.status === TicketStatus.CLOSED) &&
      !existingTicket.resolvedAt
    ) {
      updatePayload.resolvedAt = new Date();
    }

    const updated = await prisma.ticket.update({
      where: { id },
      data: updatePayload,
      include: {
        createdBy: { select: userSelect },
        assignedTo: { select: userSelect },
      },
    });

    const now = new Date();
    const sla = SlaService.getTicketSLAInfo(updated, holidayList, now);

    return {
      ...updated,
      comments: [] as Array<{ id: string; content: string; createdAt: Date; author: { id: string; name: string; email: string; role: UserRole } }>,
      sla,
    };
  }

  /**
   * Delete ticket (Admin only)
   */
  static async deleteTicket(id: string) {
    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) {
      throw { statusCode: 404, message: "Ticket not found" };
    }

    // Delete comments first
    await prisma.comment.deleteMany({ where: { ticketId: id } });

    await prisma.ticket.delete({ where: { id } });
    return { id };
  }
}
