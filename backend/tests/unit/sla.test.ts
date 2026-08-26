import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { SlaService } from "../../src/services/sla.service.js";
import { TicketPriority, TicketStatus } from "@prisma/client";

// Set timezone to UTC for predictable tests
// In production, BUSINESS_TIMEZONE=Asia/Kolkata would make business hours
// 09:00-18:00 IST which is 03:30-12:30 UTC. For test simplicity,
// we test with BUSINESS_TIMEZONE=UTC so business hours = 09:00-18:00 UTC.
const originalTZ = process.env.BUSINESS_TIMEZONE;

describe("SlaService - Business Hours & SLA Engine", () => {
  before(() => {
    process.env.BUSINESS_TIMEZONE = "UTC";
  });

  after(() => {
    if (originalTZ !== undefined) {
      process.env.BUSINESS_TIMEZONE = originalTZ;
    } else {
      delete process.env.BUSINESS_TIMEZONE;
    }
  });

  it("normal weekday calculation within business hours (Mon 10:00 + 4 business hours = Mon 14:00)", () => {
    // 2026-08-24 is a Monday
    const createdAt = new Date("2026-08-24T10:00:00.000Z");
    const dueAt = SlaService.addBusinessMinutes(createdAt, 240); // 4 hours
    assert.equal(dueAt.toISOString(), "2026-08-24T14:00:00.000Z");
  });

  it("ticket created before business hours (Mon 07:00 + 4 business hours = Mon 13:00)", () => {
    const createdAt = new Date("2026-08-24T07:00:00.000Z");
    const dueAt = SlaService.addBusinessMinutes(createdAt, 240);
    assert.equal(dueAt.toISOString(), "2026-08-24T13:00:00.000Z");
  });

  it("ticket created after business hours (Mon 20:00 + 4 business hours = Tue 13:00)", () => {
    const createdAt = new Date("2026-08-24T20:00:00.000Z");
    const dueAt = SlaService.addBusinessMinutes(createdAt, 240);
    assert.equal(dueAt.toISOString(), "2026-08-25T13:00:00.000Z");
  });

  it("Friday evening creation (Fri 17:00 + 4 business hours = Mon 12:00)", () => {
    // 2026-08-28 is a Friday
    const createdAt = new Date("2026-08-28T17:00:00.000Z");
    const dueAt = SlaService.addBusinessMinutes(createdAt, 240);
    // 1 hr on Fri (17:00 - 18:00), 3 hrs on Mon (09:00 - 12:00)
    assert.equal(dueAt.toISOString(), "2026-08-31T12:00:00.000Z");
  });

  it("weekend creation (Sat 14:00 + 4 business hours = Mon 13:00)", () => {
    // 2026-08-29 is a Saturday
    const createdAt = new Date("2026-08-29T14:00:00.000Z");
    const dueAt = SlaService.addBusinessMinutes(createdAt, 240);
    assert.equal(dueAt.toISOString(), "2026-08-31T13:00:00.000Z");
  });

  it("public holiday exclusion (Fri 17:00 + Mon holiday + 4 business hours = Tue 12:00)", () => {
    const createdAt = new Date("2026-08-28T17:00:00.000Z");
    const holidays = ["2026-08-31"]; // Mon 2026-08-31 is holiday
    const dueAt = SlaService.addBusinessMinutes(createdAt, 240, holidays);
    assert.equal(dueAt.toISOString(), "2026-09-01T12:00:00.000Z");
  });

  it("weekend + holiday combo: Fri 18:00 + Sat/Sun + Mon holiday = Tue 09:00 start", () => {
    const createdAt = new Date("2026-08-28T18:00:00.000Z");
    const holidays = ["2026-08-31"]; // Mon holiday
    const dueAt = SlaService.addBusinessMinutes(createdAt, 60, holidays); // 1 hour
    assert.equal(dueAt.toISOString(), "2026-09-01T10:00:00.000Z");
  });

  it("SLA crossing multiple business days (Mon 09:00 + 24 business hours = Wed 15:00)", () => {
    // 24 business hours = 2 days (18 hrs) + 6 hrs = Wed 15:00
    const createdAt = new Date("2026-08-24T09:00:00.000Z");
    const dueAt = SlaService.addBusinessMinutes(createdAt, 1440);
    assert.equal(dueAt.toISOString(), "2026-08-26T15:00:00.000Z");
  });

  it("first-response SLA: URGENT (1 business hour)", () => {
    const createdAt = new Date("2026-08-24T09:00:00.000Z");
    const dueAt = SlaService.addBusinessMinutes(createdAt, 60);
    assert.equal(dueAt.toISOString(), "2026-08-24T10:00:00.000Z");
  });

  it("resolution SLA: URGENT (4 business hours)", () => {
    const createdAt = new Date("2026-08-24T09:00:00.000Z");
    const dueAt = SlaService.addBusinessMinutes(createdAt, 240);
    assert.equal(dueAt.toISOString(), "2026-08-24T13:00:00.000Z");
  });

  it("SLA state transitions: ON_TRACK -> AT_RISK (>75%) -> BREACHED", () => {
    // URGENT ticket: response budget 60 mins
    const createdAt = new Date("2026-08-24T09:00:00.000Z");
    const ticket = {
      createdAt,
      priority: TicketPriority.URGENT,
      status: TicketStatus.OPEN,
    };

    // At Mon 09:30 (30 mins = 50% consumed) -> ON_TRACK
    const info1 = SlaService.getTicketSLAInfo(ticket, [], new Date("2026-08-24T09:30:00.000Z"));
    assert.equal(info1.firstResponseState, "ON_TRACK");

    // At Mon 09:48 (48 mins = 80% consumed) -> AT_RISK
    const info2 = SlaService.getTicketSLAInfo(ticket, [], new Date("2026-08-24T09:48:00.000Z"));
    assert.equal(info2.firstResponseState, "AT_RISK");

    // At Mon 10:05 (65 mins = breached) -> BREACHED
    const info3 = SlaService.getTicketSLAInfo(ticket, [], new Date("2026-08-24T10:05:00.000Z"));
    assert.equal(info3.firstResponseState, "BREACHED");
  });

  it("completed SLA clock freezing (firstResponseAt recorded within deadline stays ON_TRACK forever)", () => {
    const createdAt = new Date("2026-08-24T09:00:00.000Z");
    const ticket = {
      createdAt,
      priority: TicketPriority.URGENT,
      status: TicketStatus.OPEN,
      firstResponseAt: new Date("2026-08-24T09:30:00.000Z"), // Responded in 30 mins
    };

    // Evaluate 5 days later!
    const infoLate = SlaService.getTicketSLAInfo(
      ticket,
      [],
      new Date("2026-08-29T12:00:00.000Z")
    );
    assert.equal(infoLate.firstResponseState, "ON_TRACK");
  });

  it("resolution SLA freezing: resolved after deadline stays BREACHED", () => {
    const createdAt = new Date("2026-08-24T09:00:00.000Z");
    const ticket = {
      createdAt,
      priority: TicketPriority.URGENT, // Resolution budget 240 mins (due 13:00)
      status: TicketStatus.RESOLVED,
      resolvedAt: new Date("2026-08-24T15:00:00.000Z"), // Resolved 2 hours late
    };

    const info = SlaService.getTicketSLAInfo(ticket, [], new Date("2026-08-24T16:00:00.000Z"));
    assert.equal(info.resolutionState, "BREACHED");
  });

  it("resolution SLA freezing: resolved before deadline stays ON_TRACK forever", () => {
    const createdAt = new Date("2026-08-24T09:00:00.000Z");
    const ticket = {
      createdAt,
      priority: TicketPriority.URGENT, // Resolution budget 240 mins (due 13:00)
      status: TicketStatus.RESOLVED,
      resolvedAt: new Date("2026-08-24T12:00:00.000Z"), // Resolved 1 hour early
    };

    // Even days later, should stay ON_TRACK
    const info = SlaService.getTicketSLAInfo(ticket, [], new Date("2026-09-01T16:00:00.000Z"));
    assert.equal(info.resolutionState, "ON_TRACK");
  });

  it("AT_RISK state for resolution SLA (>75% consumed)", () => {
    const createdAt = new Date("2026-08-24T09:00:00.000Z");
    const ticket = {
      createdAt,
      priority: TicketPriority.URGENT, // Resolution budget 240 mins
      status: TicketStatus.IN_PROGRESS,
    };

    // At 12:05 = 185 mins consumed out of 240 = 77% -> AT_RISK
    const info = SlaService.getTicketSLAInfo(ticket, [], new Date("2026-08-24T12:05:00.000Z"));
    assert.equal(info.resolutionState, "AT_RISK");
  });

  it("calculateBusinessMinutesBetween: normal weekday span", () => {
    const start = new Date("2026-08-24T10:00:00.000Z");
    const end = new Date("2026-08-24T14:00:00.000Z");
    const mins = SlaService.calculateBusinessMinutesBetween(start, end);
    assert.equal(mins, 240);
  });

  it("calculateBusinessMinutesBetween: across weekend", () => {
    // Fri 17:00 to Mon 10:00 = 1h Fri + 1h Mon = 2h = 120 mins
    const start = new Date("2026-08-28T17:00:00.000Z");
    const end = new Date("2026-08-31T10:00:00.000Z");
    const mins = SlaService.calculateBusinessMinutesBetween(start, end);
    assert.equal(mins, 120);
  });

  it("isWorkingDay correctly identifies weekends", () => {
    const saturday = new Date("2026-08-29T12:00:00.000Z");
    const sunday = new Date("2026-08-30T12:00:00.000Z");
    const monday = new Date("2026-08-31T12:00:00.000Z");
    assert.equal(SlaService.isWorkingDay(saturday, new Set()), false);
    assert.equal(SlaService.isWorkingDay(sunday, new Set()), false);
    assert.equal(SlaService.isWorkingDay(monday, new Set()), true);
  });

  it("isWorkingDay correctly excludes holidays", () => {
    const holiday = new Date("2026-08-31T12:00:00.000Z"); // Monday
    const holidaySet = new Set(["2026-08-31"]);
    assert.equal(SlaService.isWorkingDay(holiday, holidaySet), false);
  });
});
