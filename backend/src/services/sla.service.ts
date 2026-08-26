import { TicketPriority, TicketStatus } from "@prisma/client";

export interface SlaPolicy {
  responseMinutes: number;
  resolutionMinutes: number;
}

export interface SLAInfo {
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
  firstResponseState: "ON_TRACK" | "AT_RISK" | "BREACHED";
  resolutionState: "ON_TRACK" | "AT_RISK" | "BREACHED";
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}

export const SLA_POLICIES: Record<TicketPriority, SlaPolicy> = {
  [TicketPriority.URGENT]: {
    responseMinutes: 60, // 1 business hour
    resolutionMinutes: 240, // 4 business hours
  },
  [TicketPriority.HIGH]: {
    responseMinutes: 240, // 4 business hours
    resolutionMinutes: 1440, // 24 business hours (2.66 days)
  },
  [TicketPriority.MEDIUM]: {
    responseMinutes: 480, // 8 business hours
    resolutionMinutes: 2880, // 48 business hours
  },
  [TicketPriority.LOW]: {
    responseMinutes: 1440, // 24 business hours
    resolutionMinutes: 4320, // 72 business hours
  },
};

const START_HOUR = 9; // 09:00
const END_HOUR = 18; // 18:00

/**
 * Get the IANA timezone identifier for business hours.
 * Configurable via BUSINESS_TIMEZONE env var. Defaults to "Asia/Kolkata".
 */
function getBusinessTimezone(): string {
  return process.env.BUSINESS_TIMEZONE ?? "Asia/Kolkata";
}

/**
 * Convert a UTC Date to the business timezone and return its components.
 * Uses Intl.DateTimeFormat to get actual local time in the configured timezone.
 */
function getBusinessTimeComponents(utcDate: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0=Sun, 6=Sat
} {
  const tz = getBusinessTimezone();
  // Use Intl to format individual parts in the business timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(utcDate);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "0";

  const weekdayStr = get("weekday");
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
    dayOfWeek: weekdayMap[weekdayStr] ?? 0,
  };
}

/**
 * Create a Date in UTC that represents a specific time in the business timezone.
 * E.g., "2026-08-24 09:00 Asia/Kolkata" → the UTC equivalent.
 */
function businessTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const tz = getBusinessTimezone();
  // Build an ISO-like string and parse it in the target timezone
  // Use a temporary date to find the UTC offset
  const monthStr = String(month).padStart(2, "0");
  const dayStr = String(day).padStart(2, "0");
  const hourStr = String(hour).padStart(2, "0");
  const minStr = String(minute).padStart(2, "0");
  const localIso = `${year}-${monthStr}-${dayStr}T${hourStr}:${minStr}:00`;

  // Use an iterative approach: create a UTC date, check what time it is in business tz,
  // then adjust. This is reliable across DST transitions.
  let guess = new Date(`${localIso}Z`); // Start with UTC guess
  for (let i = 0; i < 3; i++) {
    const components = getBusinessTimeComponents(guess);
    const diffH = hour - components.hour;
    const diffM = minute - components.minute;
    guess = new Date(guess.getTime() + (diffH * 60 + diffM) * 60 * 1000);
  }

  return guess;
}

export class SlaService {
  /**
   * Helper to format date string YYYY-MM-DD in business timezone for holiday checking
   */
  private static formatDateKey(date: Date): string {
    const comp = getBusinessTimeComponents(date);
    const m = String(comp.month).padStart(2, "0");
    const d = String(comp.day).padStart(2, "0");
    return `${comp.year}-${m}-${d}`;
  }

  /**
   * Check if a given date falls on a weekend or public holiday (in business timezone)
   */
  public static isWorkingDay(date: Date, holidaySet: Set<string>): boolean {
    const comp = getBusinessTimeComponents(date);
    if (comp.dayOfWeek === 0 || comp.dayOfWeek === 6) {
      return false;
    }
    const dateKey = this.formatDateKey(date);
    if (holidaySet.has(dateKey)) {
      return false;
    }
    return true;
  }

  /**
   * Get the start of business hours for the day of the given date (in business timezone).
   * Returns a UTC Date representing START_HOUR:00 in business timezone.
   */
  private static getBusinessDayStart(date: Date): Date {
    const comp = getBusinessTimeComponents(date);
    return businessTimeToUtc(comp.year, comp.month, comp.day, START_HOUR, 0);
  }

  /**
   * Get the next day's start of business hours (in business timezone).
   */
  private static getNextBusinessDayStart(date: Date): Date {
    // Add 24 hours to move to next calendar day, then get start of that day
    const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    return this.getBusinessDayStart(nextDay);
  }

  /**
   * Add business minutes to a starting Date considering working hours (09:00 - 18:00 business tz) and holidays.
   */
  public static addBusinessMinutes(
    startDate: Date,
    minutesToAdd: number,
    holidayList: string[] = []
  ): Date {
    const holidaySet = new Set(holidayList);
    let current = new Date(startDate.getTime());
    let remainingMinutes = minutesToAdd;

    while (remainingMinutes > 0) {
      // Check if current day is working day
      if (!this.isWorkingDay(current, holidaySet)) {
        current = this.getNextBusinessDayStart(current);
        continue;
      }

      const comp = getBusinessTimeComponents(current);

      // Before business hours
      if (comp.hour < START_HOUR) {
        current = this.getBusinessDayStart(current);
        continue;
      }

      // After business hours
      if (comp.hour >= END_HOUR) {
        current = this.getNextBusinessDayStart(current);
        continue;
      }

      // We are inside business hours (09:00 to 18:00 business tz)
      const minutesLeftToday =
        (END_HOUR - comp.hour) * 60 - comp.minute - (comp.second > 0 ? 1 : 0);

      if (remainingMinutes <= minutesLeftToday) {
        current = new Date(current.getTime() + remainingMinutes * 60 * 1000);
        remainingMinutes = 0;
      } else {
        remainingMinutes -= minutesLeftToday;
        current = this.getNextBusinessDayStart(current);
      }
    }

    return current;
  }

  /**
   * Calculate total business minutes elapsed between start date and end date
   */
  public static calculateBusinessMinutesBetween(
    start: Date,
    end: Date,
    holidayList: string[] = []
  ): number {
    if (start >= end) return 0;

    const holidaySet = new Set(holidayList);
    let current = new Date(start.getTime());
    let totalMinutes = 0;

    while (current < end) {
      if (!this.isWorkingDay(current, holidaySet)) {
        current = this.getNextBusinessDayStart(current);
        continue;
      }

      const comp = getBusinessTimeComponents(current);

      if (comp.hour < START_HOUR) {
        current = this.getBusinessDayStart(current);
        continue;
      }

      if (comp.hour >= END_HOUR) {
        current = this.getNextBusinessDayStart(current);
        continue;
      }

      // End of today's business window in UTC
      const endOfBiz = businessTimeToUtc(comp.year, comp.month, comp.day, END_HOUR, 0);

      const targetEnd = end < endOfBiz ? end : endOfBiz;
      const diffMs = targetEnd.getTime() - current.getTime();
      const mins = Math.max(0, Math.floor(diffMs / (60 * 1000)));

      totalMinutes += mins;

      if (end <= endOfBiz) {
        break;
      } else {
        current = this.getNextBusinessDayStart(current);
      }
    }

    return totalMinutes;
  }

  /**
   * Calculate SLA Due Times & States for a given ticket.
   *
   * SLA State rules:
   *   ON_TRACK: 0%–75% of SLA budget consumed (inclusive of 75%)
   *   AT_RISK: >75% consumed but deadline not passed
   *   BREACHED: deadline passed
   */
  public static getTicketSLAInfo(
    ticket: {
      createdAt: Date;
      priority: TicketPriority;
      status: TicketStatus;
      firstResponseAt?: Date | null;
      resolvedAt?: Date | null;
      slaDeadline?: Date | null;
    },
    holidayList: string[] = [],
    now: Date = new Date()
  ): SLAInfo {
    const policy = SLA_POLICIES[ticket.priority];

    const firstResponseDueAt = this.addBusinessMinutes(
      ticket.createdAt,
      policy.responseMinutes,
      holidayList
    );

    const resolutionDueAt =
      ticket.slaDeadline ??
      this.addBusinessMinutes(ticket.createdAt, policy.resolutionMinutes, holidayList);

    // --- First Response SLA ---
    let firstResponseState: "ON_TRACK" | "AT_RISK" | "BREACHED" = "ON_TRACK";
    let firstResponseRemainingMinutes = 0;

    if (ticket.firstResponseAt) {
      // Clock frozen!
      if (ticket.firstResponseAt <= firstResponseDueAt) {
        firstResponseState = "ON_TRACK";
      } else {
        firstResponseState = "BREACHED";
      }
      firstResponseRemainingMinutes = 0;
    } else {
      const consumedMins = this.calculateBusinessMinutesBetween(
        ticket.createdAt,
        now,
        holidayList
      );
      firstResponseRemainingMinutes = Math.max(
        0,
        this.calculateBusinessMinutesBetween(now, firstResponseDueAt, holidayList)
      );

      if (now > firstResponseDueAt || consumedMins >= policy.responseMinutes) {
        firstResponseState = "BREACHED";
        firstResponseRemainingMinutes = 0;
      } else {
        const consumedRatio = consumedMins / policy.responseMinutes;
        if (consumedRatio > 0.75) {
          firstResponseState = "AT_RISK";
        } else {
          firstResponseState = "ON_TRACK";
        }
      }
    }

    // --- Resolution SLA ---
    let resolutionState: "ON_TRACK" | "AT_RISK" | "BREACHED" = "ON_TRACK";
    let resolutionRemainingMinutes = 0;

    const isResolvedOrClosed =
      ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED;

    if (isResolvedOrClosed && ticket.resolvedAt) {
      // Clock frozen!
      if (ticket.resolvedAt <= resolutionDueAt) {
        resolutionState = "ON_TRACK";
      } else {
        resolutionState = "BREACHED";
      }
      resolutionRemainingMinutes = 0;
    } else {
      const consumedMins = this.calculateBusinessMinutesBetween(
        ticket.createdAt,
        now,
        holidayList
      );
      resolutionRemainingMinutes = Math.max(
        0,
        this.calculateBusinessMinutesBetween(now, resolutionDueAt, holidayList)
      );

      if (now > resolutionDueAt || consumedMins >= policy.resolutionMinutes) {
        resolutionState = "BREACHED";
        resolutionRemainingMinutes = 0;
      } else {
        const consumedRatio = consumedMins / policy.resolutionMinutes;
        if (consumedRatio > 0.75) {
          resolutionState = "AT_RISK";
        } else {
          resolutionState = "ON_TRACK";
        }
      }
    }

    return {
      firstResponseDueAt,
      resolutionDueAt,
      firstResponseState,
      resolutionState,
      firstResponseRemainingMinutes,
      resolutionRemainingMinutes,
    };
  }
}
