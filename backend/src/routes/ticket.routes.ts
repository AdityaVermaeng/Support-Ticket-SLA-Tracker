import { Router } from "express";
import { TicketController } from "../controllers/ticket.controller.js";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware.js";
import { UserRole } from "@prisma/client";

const router = Router();

router.use(authenticateJWT);

router.post("/", TicketController.createTicket);
router.get("/", TicketController.listTickets);
router.get("/:id", TicketController.getTicketById);
router.patch("/:id", TicketController.updateTicket);
router.delete("/:id", authorizeRoles(UserRole.ADMIN), TicketController.deleteTicket);

export default router;
