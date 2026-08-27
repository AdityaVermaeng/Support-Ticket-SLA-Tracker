import { DashboardService } from "../../services/dashboard.service.js";
import { createGraphQLError, translateServiceError } from "../errors.js";
import type { GraphQLContext } from "../context.js";
import { loadHolidayStrings } from "../../utils/holiday.js";

export const dashboardResolvers = {
  Query: {
    dashboard: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (!context.user) {
        throw createGraphQLError("Authentication required", "UNAUTHORIZED");
      }
      try {
        return await DashboardService.getDashboardStats(
          context.user,
          await loadHolidayStrings()
        );
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },
  },
};
