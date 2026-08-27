import { UserRole } from "@prisma/client";
import { CommentService } from "../../services/comment.service.js";
import { createGraphQLError, translateServiceError } from "../errors.js";
import type { GraphQLContext } from "../context.js";

function mapRoleToGraphQL(role: UserRole): string {
  if (role === UserRole.ADMIN) return "AGENT";
  return role;
}

export const commentResolvers = {
  Mutation: {
    addComment: async (
      _parent: unknown,
      args: { ticketId: string; content: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw createGraphQLError("Authentication required", "UNAUTHORIZED");
      }
      try {
        const comment = await CommentService.addComment(
          args.ticketId,
          args.content,
          context.user
        );
        return {
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt.toISOString(),
          author: {
            id: comment.author.id,
            name: comment.author.name,
            email: comment.author.email,
            role: mapRoleToGraphQL(comment.author.role),
          },
        };
      } catch (error: unknown) {
        throw translateServiceError(error);
      }
    },
  },
};
