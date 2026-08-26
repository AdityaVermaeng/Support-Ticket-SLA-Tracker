import prisma from "../config/prisma.js";

interface HolidayRecord {
  id: string;
  date: Date;
  name: string;
}

/**
 * Load holiday date strings (YYYY-MM-DD) from the database.
 * Used by SLA calculations throughout the application.
 */
export async function loadHolidayStrings(): Promise<string[]> {
  const db = prisma as unknown as {
    holiday: {
      findMany: () => Promise<HolidayRecord[]>;
    };
  };
  const holidays = await db.holiday.findMany();
  return holidays.map((h) => {
    const d = h.date;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
}
