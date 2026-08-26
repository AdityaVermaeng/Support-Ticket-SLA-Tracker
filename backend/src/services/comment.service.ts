import prisma from "../config/prisma.js";
import { UserRole } from "@prisma/client";

export class CommentService {
  static async addComment(
    ticketId: string,
    content: string,
    author: { id: string; role: UserRole }
  ) {
    if (!content || !content.trim()) {
      throw { statusCode: 400, message: "Comment content is required" };
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw { statusCode: 404, message: "Ticket not found" };
    }

    // Access check: CUSTOMER can only comment on their own ticket
    if (author.role === UserRole.REPORTER && ticket.createdById !== author.id) {
      throw { statusCode: 403, message: "Forbidden: Cannot comment on other users' tickets" };
    }

    // Create the comment
    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        ticketId,
        authorId: author.id,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    // First Response SLA Freezing:
    // If author is NOT the creator/reporter AND firstResponseAt is not set, set firstResponseAt = now()
    if (author.id !== ticket.createdById && !ticket.firstResponseAt) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          firstResponseAt: new Date(),
        },
      });
    }

    return comment;
  }

  static async getComments(ticketId: string, requestingUser: { id: string; role: UserRole }) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw { statusCode: 404, message: "Ticket not found" };
    }

    if (requestingUser.role === UserRole.REPORTER && ticket.createdById !== requestingUser.id) {
      throw { statusCode: 403, message: "Forbidden: Cannot view comments of other users' tickets" };
    }

    return prisma.comment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }
}
