import { Router } from "express";
import { CommentController } from "../controllers/comment.controller.js";
import { authenticateJWT } from "../middleware/auth.middleware.js";

const router = Router({ mergeParams: true });

router.use(authenticateJWT);

router.post("/", CommentController.addComment);
router.get("/", CommentController.getComments);

export default router;
