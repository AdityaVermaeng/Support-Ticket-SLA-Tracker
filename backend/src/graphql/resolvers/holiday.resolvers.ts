import prisma from "../../config/prisma.js";

interface HolidayRecord {
  id: string;
  date: Date;
  name: string;
}

export const holidayResolvers = {
  Query: {
    holidays: async (): Promise<HolidayRecord[]> => {
      const db = prisma as unknown as {
        holiday: {
          findMany: (options?: { orderBy?: { date?: "asc" | "desc" } }) => Promise<HolidayRecord[]>;
        };
      };
      return db.holiday.findMany({
        orderBy: { date: "asc" },
      });
    },
  },
};
