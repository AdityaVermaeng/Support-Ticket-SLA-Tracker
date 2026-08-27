import { UserRole } from "@prisma/client";

/**
 * GraphQL context attached to every request.
 * `user` is populated from the JWT token in the Authorization header.
 */
export interface GraphQLContext {
  user: {
    id: string;
    email: string;
    role: UserRole;
  } | null;
}
