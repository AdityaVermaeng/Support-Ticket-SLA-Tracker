import "dotenv/config";
import { UserRole, TicketPriority, TicketStatus } from "@prisma/client";
import bcrypt from "bcrypt";
import prisma from "../src/config/prisma.js";
import { SlaService, SLA_POLICIES } from "../src/services/sla.service.js";

interface HolidayRecord {
  id: string;
  date: Date;
  name: string;
}

const db = prisma as unknown as {
  holiday: {
    findFirst: (options: { where: { date: Date } }) => Promise<HolidayRecord | null>;
    create: (options: { data: { date: Date; name: string } }) => Promise<HolidayRecord>;
  };
};

async function main() {
  console.log("Seeding database...");

  // 1. Create seed users
  const passwordHash = await bcrypt.hash("password123", 10);

  const reporter = await prisma.user.upsert({
    where: { email: "reporter@example.com" },
    update: {},
    create: {
      name: "Alice Reporter",
      email: "reporter@example.com",
      passwordHash,
      role: (UserRole as unknown as { REPORTER: UserRole }).REPORTER ?? ("REPORTER" as UserRole),
    },
  });

  const agent = await prisma.user.upsert({
    where: { email: "agent@example.com" },
    update: {},
    create: {
      name: "Bob Agent",
      email: "agent@example.com",
      passwordHash,
      role: UserRole.AGENT,
    },
  });

  console.log(`Seeded users: ${reporter.email}, ${agent.email}`);

  // 2. Seed holidays
  const holidays = [
    { date: new Date("2026-01-26T00:00:00.000Z"), name: "Republic Day" },
    { date: new Date("2026-08-15T00:00:00.000Z"), name: "Independence Day" },
    { date: new Date("2026-10-02T00:00:00.000Z"), name: "Gandhi Jayanti" },
  ];

  for (const h of holidays) {
    const existing = await db.holiday.findFirst({
      where: { date: h.date },
    });
    if (!existing) {
      await db.holiday.create({ data: h });
      console.log(`Created holiday: ${h.name} (${h.date.toISOString().slice(0, 10)})`);
    }
  }

  // Load holiday strings for SLA calculations
  const holidayStrings = holidays.map((h) => h.date.toISOString().slice(0, 10));

  // 3. Create sample tickets across priorities
  const now = new Date();

  const ticketData = [
    {
      title: "URGENT: Payment Processing System Down",
      description: "Checkout fails for all customers with 500 error",
      priority: TicketPriority.URGENT,
      status: TicketStatus.OPEN,
    },
    {
      title: "HIGH: Slow API Response Times",
      description: "Dashboard loading takes over 10 seconds",
      priority: TicketPriority.HIGH,
      status: TicketStatus.IN_PROGRESS,
      assignedToId: agent.id,
    },
    {
      title: "MEDIUM: Export CSV Button Missing",
      description: "Reports section lacks export CSV action",
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
    },
    {
      title: "LOW: Typo on Settings Page",
      description: "Spelling mistake in profile notification label",
      priority: TicketPriority.LOW,
      status: TicketStatus.RESOLVED,
      assignedToId: agent.id,
      resolvedAt: now,
    },
  ];

  for (const t of ticketData) {
    const policy = SLA_POLICIES[t.priority];
    const slaDeadline = SlaService.addBusinessMinutes(now, policy.resolutionMinutes, holidayStrings);

    const created = await prisma.ticket.create({
      data: {
        ...t,
        createdById: reporter.id,
        slaDeadline,
      },
    });

    console.log(`Created ticket: #${created.id.slice(0, 8)} (${created.title})`);
  }

  console.log("Database seed completed successfully.");
}

main()
  .catch((e) => {
    console.error("Error during seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
