import { GraphQLError } from "graphql";

export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "TICKET_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_STATUS_TRANSITION"
  | "INVALID_PRIORITY"
  | "INVALID_COMMENT";

export function createGraphQLError(
  message: string,
  code: AppErrorCode
): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code },
  });
}

interface ServiceError {
  statusCode?: number;
  message?: string;
}

/**
 * Translates service-layer errors (thrown as plain objects with statusCode)
 * into proper GraphQL errors with machine-readable extension codes.
 */
export function translateServiceError(error: unknown): GraphQLError {
  const err = error as ServiceError;
  const message = err.message ?? "Internal server error";
  const status = err.statusCode ?? 500;

  // Map HTTP status codes and message patterns to GraphQL error codes
  if (status === 401) {
    return createGraphQLError(message, "UNAUTHORIZED");
  }
  if (status === 403) {
    return createGraphQLError(message, "FORBIDDEN");
  }
  if (status === 404) {
    if (message.toLowerCase().includes("ticket")) {
      return createGraphQLError(message, "TICKET_NOT_FOUND");
    }
    if (message.toLowerCase().includes("user") || message.toLowerCase().includes("assignee")) {
      return createGraphQLError(message, "USER_NOT_FOUND");
    }
    return createGraphQLError(message, "VALIDATION_ERROR");
  }
  if (message.includes("INVALID_STATUS_TRANSITION")) {
    return createGraphQLError(message, "INVALID_STATUS_TRANSITION");
  }
  if (message.toLowerCase().includes("priority")) {
    return createGraphQLError(message, "INVALID_PRIORITY");
  }
  if (message.toLowerCase().includes("comment")) {
    return createGraphQLError(message, "INVALID_COMMENT");
  }
  if (status === 400 || status === 409) {
    return createGraphQLError(message, "VALIDATION_ERROR");
  }

  // Fallback for unknown errors
  return createGraphQLError(message, "VALIDATION_ERROR");
}
