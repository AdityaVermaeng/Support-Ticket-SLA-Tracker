import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../src/config/prisma.js";
import { AuthService } from "../../src/services/auth.service.js";
import { TicketService } from "../../src/services/ticket.service.js";
import { CommentService } from "../../src/services/comment.service.js";
import { TicketPriority, UserRole, TicketStatus } from "@prisma/client";

interface TestUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

describe("Integration Test - Full Ticket & SLA Flow (Real PostgreSQL)", () => {
  let reporterUser: TestUser;
  let agentUser: TestUser;

  before(async () => {
    // Set timezone to UTC for test predictability
    process.env.BUSINESS_TIMEZONE = "UTC";

    // Register test users
    const reporter = await AuthService.register({
      name: "Integration Reporter",
      email: `reporter-${Date.now()}@example.com`,
      password: "password123",
      role: (UserRole as unknown as { REPORTER: UserRole }).REPORTER ?? ("REPORTER" as UserRole),
    });
    reporterUser = reporter.user as TestUser;

    const agent = await AuthService.register({
      name: "Integration Agent",
      email: `agent-${Date.now()}@example.com`,
      password: "password123",
      role: UserRole.AGENT,
    });
    agentUser = agent.user as TestUser;
  });

  after(async () => {
    // Cleanup created users & tickets cleanly
    try {
      if (reporterUser) {
        const tickets = await prisma.ticket.findMany({
          where: { createdById: reporterUser.id },
          select: { id: true },
        });
        const ticketIds = tickets.map((t) => t.id);

        if (ticketIds.length > 0) {
          await prisma.comment.deleteMany({ where: { ticketId: { in: ticketIds } } });
          await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
        }
        await prisma.user.deleteMany({ where: { id: reporterUser.id } });
      }
      if (agentUser) {
        await prisma.user.deleteMany({ where: { id: agentUser.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("completes full ticket lifecycle: create -> reporter comment -> agent comment -> verify firstResponseAt & SLA info", async () => {
    // 1. Create Ticket
    const ticket = await TicketService.createTicket({
      title: "Payment Gateway Failure",
      description: "Transaction failed during checkout step",
      priority: TicketPriority.URGENT,
      createdById: reporterUser.id,
    });

    assert.ok(ticket.id);
    assert.equal(ticket.title, "Payment Gateway Failure");
    assert.equal(ticket.priority, "URGENT");
    assert.equal(ticket.status, "OPEN");
    assert.equal(ticket.firstResponseAt, null);
    assert.ok(ticket.sla);
    assert.equal(ticket.sla.firstResponseState, "ON_TRACK");

    // 2. Add Reporter Comment (Reporter)
    const reporterComment = await CommentService.addComment(
      ticket.id,
      "Adding extra debug details...",
      { id: reporterUser.id, role: reporterUser.role }
    );
    assert.equal(reporterComment.content, "Adding extra debug details...");

    // Check that firstResponseAt is STILL null after reporter comment!
    const ticketAfterReporterComment = await TicketService.getTicketById(ticket.id, {
      id: reporterUser.id,
      role: reporterUser.role,
    });
    assert.equal(ticketAfterReporterComment.firstResponseAt, null);

    // 3. Add Agent Comment (First Response!)
    const agentComment = await CommentService.addComment(
      ticket.id,
      "Hello, I am looking into your issue now.",
      { id: agentUser.id, role: agentUser.role }
    );
    assert.equal(agentComment.content, "Hello, I am looking into your issue now.");

    // Verify firstResponseAt was recorded!
    const ticketAfterAgentComment = await TicketService.getTicketById(ticket.id, {
      id: agentUser.id,
      role: agentUser.role,
    });
    assert.notEqual(ticketAfterAgentComment.firstResponseAt, null);
    assert.equal(ticketAfterAgentComment.sla.firstResponseState, "ON_TRACK");

    // 4. Update Ticket Status to RESOLVED by Agent
    const resolvedTicket = await TicketService.updateTicket(
      ticket.id,
      { status: TicketStatus.RESOLVED },
      { id: agentUser.id, role: agentUser.role }
    );

    assert.equal(resolvedTicket.status, "RESOLVED");
    assert.notEqual(resolvedTicket.resolvedAt, null);
    assert.equal(resolvedTicket.sla.resolutionState, "ON_TRACK");
  });

  it("rejects invalid status transitions", async () => {
    const ticket = await TicketService.createTicket({
      title: "Test Invalid Transition",
      description: "Testing CLOSED -> IN_PROGRESS rejection",
      priority: TicketPriority.LOW,
      createdById: reporterUser.id,
    });

    // Move to RESOLVED
    await TicketService.updateTicket(
      ticket.id,
      { status: TicketStatus.RESOLVED },
      { id: agentUser.id, role: agentUser.role }
    );

    // Move to CLOSED
    await TicketService.updateTicket(
      ticket.id,
      { status: TicketStatus.CLOSED },
      { id: agentUser.id, role: agentUser.role }
    );

    // Try CLOSED -> IN_PROGRESS (should fail)
    try {
      await TicketService.updateTicket(
        ticket.id,
        { status: TicketStatus.IN_PROGRESS },
        { id: agentUser.id, role: agentUser.role }
      );
      assert.fail("Should have thrown INVALID_STATUS_TRANSITION");
    } catch (error: unknown) {
      const err = error as { statusCode: number; message: string };
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes("INVALID_STATUS_TRANSITION"));
    }
  });

  it("validates ticket creation inputs", async () => {
    // Empty title
    try {
      await TicketService.createTicket({
        title: "",
        description: "Some description",
        priority: TicketPriority.LOW,
        createdById: reporterUser.id,
      });
      assert.fail("Should have thrown validation error");
    } catch (error: unknown) {
      const err = error as { statusCode: number };
      assert.equal(err.statusCode, 400);
    }
  });

  it("enforces authorization: reporter cannot change ticket status", async () => {
    const ticket = await TicketService.createTicket({
      title: "Auth Test Ticket",
      description: "Testing reporter cannot change status",
      priority: TicketPriority.MEDIUM,
      createdById: reporterUser.id,
    });

    try {
      await TicketService.updateTicket(
        ticket.id,
        { status: TicketStatus.RESOLVED },
        { id: reporterUser.id, role: reporterUser.role }
      );
      assert.fail("Should have thrown FORBIDDEN");
    } catch (error: unknown) {
      const err = error as { statusCode: number };
      assert.equal(err.statusCode, 403);
    }
  });
});
