import { Router } from "express";
import { getClientStats } from "./clientStats.controller";
// Import your authentication / authorization middlewares if needed
// import { protect, restrictTo } from "../../middlewares/auth.middleware";

const router = Router();


router.get("/:id", getClientStats);

export default router;