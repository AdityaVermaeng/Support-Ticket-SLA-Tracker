import prisma from "../config/prisma.js";
import { TicketStatus, UserRole, Prisma } from "@prisma/client";
import { SlaService } from "./sla.service.js";

export class DashboardService {
  static async getDashboardStats(
    requestingUser: { id: string; role: UserRole },
    holidayList: string[] = []
  ) {
    const where: Prisma.TicketWhereInput = {};
    if (requestingUser.role === UserRole.REPORTER) {
      where.createdById = requestingUser.id;
    }

    const tickets = await prisma.ticket.findMany({
      where,
    });

    const now = new Date();

    let openTickets = 0;
    let inProgressTickets = 0;
    let resolvedTickets = 0;
    let closedTickets = 0;
    let atRiskTickets = 0;
    let breachedTickets = 0;

    for (const t of tickets) {
      if (t.status === TicketStatus.OPEN) openTickets++;
      else if (t.status === TicketStatus.IN_PROGRESS) inProgressTickets++;
      else if (t.status === TicketStatus.RESOLVED) resolvedTickets++;
      else if (t.status === TicketStatus.CLOSED) closedTickets++;

      const sla = SlaService.getTicketSLAInfo(t, holidayList, now);
      if (
        sla.resolutionState === "BREACHED" ||
        sla.firstResponseState === "BREACHED"
      ) {
        breachedTickets++;
      } else if (
        sla.resolutionState === "AT_RISK" ||
        sla.firstResponseState === "AT_RISK"
      ) {
        atRiskTickets++;
      }
    }

    return {
      totalTickets: tickets.length,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      closedTickets,
      atRiskTickets,
      breachedTickets,
    };
  }
}
