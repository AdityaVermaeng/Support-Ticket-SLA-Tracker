import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller.js";
import { authenticateJWT } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authenticateJWT, DashboardController.getDashboard);

export default router;
