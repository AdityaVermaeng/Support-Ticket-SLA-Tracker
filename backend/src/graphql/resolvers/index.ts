import { authResolvers } from "./auth.resolvers.js";
import { ticketResolvers } from "./ticket.resolvers.js";
import { commentResolvers } from "./comment.resolvers.js";
import { dashboardResolvers } from "./dashboard.resolvers.js";
import { holidayResolvers } from "./holiday.resolvers.js";

/**
 * Merged resolvers for all GraphQL modules.
 * Uses a simple deep-merge of Query and Mutation fields.
 */
export const resolvers = {
  Query: {
    ...authResolvers.Query,
    ...ticketResolvers.Query,
    ...dashboardResolvers.Query,
    ...holidayResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...ticketResolvers.Mutation,
    ...commentResolvers.Mutation,
  },
};