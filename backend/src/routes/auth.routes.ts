import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware.js";
import { UserRole } from "@prisma/client";

const router = Router();

router.post("/register", AuthController.register);
router.post("/login", AuthController.login);
router.get("/me", authenticateJWT, AuthController.getMe);
router.get("/users", authenticateJWT, authorizeRoles(UserRole.AGENT, UserRole.ADMIN), AuthController.getUsers);

export default router;
