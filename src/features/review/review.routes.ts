import { Router } from "express";
import {
    createReview,
    getContractReviews,
    getUserReviews,
} from "./review.controller.js";
import { authenticationMiddleware } from "../../middleware/authentication.middleware.js";

const router = Router();

// ==========================================
// REVIEW ROUTES
// ==========================================

// 1. Submit review for completed contract
router.post("/", authenticationMiddleware, createReview);

// 2. Get reviews for a contract
router.get("/contract/:contractId", getContractReviews);

// 3. Get reviews received by a user
router.get("/user/:userId", getUserReviews);

export default router;
