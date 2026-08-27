import { AuthService } from "../../services/auth.service.js";
import { createGraphQLError, translateServiceError } from "../errors.js";
import { UserRole } from "@prisma/client";
import type { GraphQLContext } from "../context.js";

/**
 * Maps Prisma UserRole to the GraphQL enum value.
 * ADMIN is mapped to AGENT in GraphQL since we don't expose ADMIN publicly.
 */
function mapRoleToGraphQL(role: UserRole): string {
  if (role === UserRole.ADMIN) return "AGENT";
  return role;
}

/**
 * Maps a GraphQL role string to Prisma UserRole.
 */
function mapRoleToPrisma(role: string | undefined): UserRole {
  if (role === "AGENT") return UserRole.AGENT;
  return UserRole.REPORTER;
}

/**
 * Strips passwordHash and maps role for a user object returned from Prisma.
 */
function sanitizeUser(user: { id: string; name: string; email: string; role: UserRole; createdAt: Date; updatedAt?: Date }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: mapRoleToGraphQL(user.role),
    createdAt: user.createdAt.toISOString(),
  };
}

export const authResolvers = {
  Query: {
    me: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (!context.user) {
        throw createGraphQLError("Authentication required", "UNAUTHORIZED");
      }
      try {
        const user = await AuthService.getMe(context.user.id);
        return sanitizeUser(user);
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },

    users: async (_parent: unknown, args: { role?: string }, context: GraphQLContext) => {
      if (!context.user) {
        throw createGraphQLError("Authentication required", "UNAUTHORIZED");
      }
      if (context.user.role !== UserRole.AGENT && context.user.role !== UserRole.ADMIN) {
        throw createGraphQLError("Only agents can list users", "FORBIDDEN");
      }
      try {
        const prismaRole = args.role ? mapRoleToPrisma(args.role) : undefined;
        const users = await AuthService.getUsers(prismaRole);
        return users.map(sanitizeUser);
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },
  },

  Mutation: {
    register: async (_parent: unknown, args: { name: string; email: string; password: string; role?: string }) => {
      try {
        const prismaRole = mapRoleToPrisma(args.role);
        const result = await AuthService.register({
          name: args.name,
          email: args.email,
          password: args.password,
          role: prismaRole,
        });
        return {
          token: result.token,
          user: sanitizeUser(result.user),
        };
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },

    login: async (_parent: unknown, args: { email: string; password: string }) => {
      try {
        const result = await AuthService.login(args);
        return {
          token: result.token,
          user: sanitizeUser(result.user),
        };
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },
  },
};
