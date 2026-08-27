import { TicketPriority, TicketStatus, UserRole } from "@prisma/client";
import { TicketService } from "../../services/ticket.service.js";
import { createGraphQLError, translateServiceError } from "../errors.js";
import type { GraphQLContext } from "../context.js";
import { loadHolidayStrings } from "../../utils/holiday.js";

/**
 * Maps a Prisma UserRole to the GraphQL UserRole string.
 */
function mapRoleToGraphQL(role: UserRole): string {
  if (role === UserRole.ADMIN) return "AGENT";
  return role;
}

/**
 * Format a user object from Prisma for GraphQL output (no passwordHash).
 */
function formatUser(user: { id: string; name: string; email: string; role: UserRole } | null) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: mapRoleToGraphQL(user.role),
  };
}

/**
 * Format SLA dates as ISO strings for GraphQL DateTime scalars.
 */
function formatSla(sla: {
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
  firstResponseState: string;
  resolutionState: string;
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}) {
  return {
    firstResponseDueAt: sla.firstResponseDueAt.toISOString(),
    resolutionDueAt: sla.resolutionDueAt.toISOString(),
    firstResponseState: sla.firstResponseState,
    resolutionState: sla.resolutionState,
    firstResponseRemainingMinutes: sla.firstResponseRemainingMinutes,
    resolutionRemainingMinutes: sla.resolutionRemainingMinutes,
  };
}

interface TicketWithSla {
  id: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  createdBy: { id: string; name: string; email: string; role: UserRole };
  assignedTo: { id: string; name: string; email: string; role: UserRole } | null;
  comments?: Array<{
    id: string;
    content: string;
    createdAt: Date;
    author: { id: string; name: string; email: string; role: UserRole };
  }>;
  sla: {
    firstResponseDueAt: Date;
    resolutionDueAt: Date;
    firstResponseState: string;
    resolutionState: string;
    firstResponseRemainingMinutes: number;
    resolutionRemainingMinutes: number;
  };
}

/**
 * Format a full ticket object for GraphQL output.
 */
function formatTicket(ticket: TicketWithSla) {
  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    createdBy: formatUser(ticket.createdBy),
    assignedTo: formatUser(ticket.assignedTo),
    comments: (ticket.comments ?? []).map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      author: formatUser(c.author),
    })),
    sla: formatSla(ticket.sla),
  };
}

export const ticketResolvers = {
  Query: {
    tickets: async (
      _parent: unknown,
      args: {
        status?: TicketStatus;
        priority?: TicketPriority;
        assigneeId?: string;
        slaState?: "ON_TRACK" | "AT_RISK" | "BREACHED";
        take?: number;
        cursor?: string;
      },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw createGraphQLError("Authentication required", "UNAUTHORIZED");
      }
      try {
        const result = await TicketService.listTickets(
          {
            status: args.status,
            priority: args.priority,
            assignedToId: args.assigneeId,
            slaState: args.slaState,
            take: args.take,
            cursor: args.cursor,
          },
          context.user,
          await loadHolidayStrings()
        );
        return {
          nodes: result.nodes.map(formatTicket),
          pageInfo: result.pageInfo,
        };
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },

    ticket: async (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      if (!context.user) {
        throw createGraphQLError("Authentication required", "UNAUTHORIZED");
      }
      try {
        const ticket = await TicketService.getTicketById(
          args.id,
          context.user,
          await loadHolidayStrings()
        );
        return formatTicket(ticket);
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },
  },

  Mutation: {
    createTicket: async (
      _parent: unknown,
      args: { title: string; description: string; priority: TicketPriority },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw createGraphQLError("Authentication required", "UNAUTHORIZED");
      }
      try {
        const ticket = await TicketService.createTicket(
          {
            title: args.title,
            description: args.description,
            priority: args.priority,
            createdById: context.user.id,
          },
          await loadHolidayStrings()
        );
        return formatTicket(ticket);
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },

    assignTicket: async (
      _parent: unknown,
      args: { ticketId: string; assigneeId: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw createGraphQLError("Authentication required", "UNAUTHORIZED");
      }
      if (context.user.role !== UserRole.AGENT && context.user.role !== UserRole.ADMIN) {
        throw createGraphQLError("Only agents can assign tickets", "FORBIDDEN");
      }
      try {
        const ticket = await TicketService.updateTicket(
          args.ticketId,
          { assignedToId: args.assigneeId },
          context.user,
          await loadHolidayStrings()
        );
        return formatTicket(ticket);
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },

    changeTicketStatus: async (
      _parent: unknown,
      args: { ticketId: string; status: TicketStatus },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw createGraphQLError("Authentication required", "UNAUTHORIZED");
      }
      if (context.user.role !== UserRole.AGENT && context.user.role !== UserRole.ADMIN) {
        throw createGraphQLError("Only agents can change ticket status", "FORBIDDEN");
      }
      try {
        const ticket = await TicketService.updateTicket(
          args.ticketId,
          { status: args.status },
          context.user,
          await loadHolidayStrings()
        );
        return formatTicket(ticket);
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },

    resolveTicket: async (
      _parent: unknown,
      args: { ticketId: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw createGraphQLError("Authentication required", "UNAUTHORIZED");
      }
      if (context.user.role !== UserRole.AGENT && context.user.role !== UserRole.ADMIN) {
        throw createGraphQLError("Only agents can resolve tickets", "FORBIDDEN");
      }
      try {
        const ticket = await TicketService.updateTicket(
          args.ticketId,
          { status: TicketStatus.RESOLVED },
          context.user,
          await loadHolidayStrings()
        );
        return formatTicket(ticket);
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },
  },
};
