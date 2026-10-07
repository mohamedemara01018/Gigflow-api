import { Router } from "express";
import {
    payMilestone,
    createMilestonePayment,
    getPaymentById,
    getUserPayments,
    refundPayment,
} from "./payment.controller.js";
import { authenticationMiddleware } from "../../middleware/authentication.middleware.js";
import { authorizationMiddleware } from "../../middleware/authorization.middleware.js";
import { UserRole } from "../../utils/enums.utils.js";
import {
    validatePaymentIdParam,
    validateMilestoneIdParam,
    validatePayMilestoneBody,
    validateRefundPaymentBody,
    validateGetPaymentsQuery,
} from "./payment.validation.js";

const router = Router();

// All payment routes require authentication
router.use(authenticationMiddleware);

// 1. Get current user's payments with pagination and filters
router.get("/", validateGetPaymentsQuery, getUserPayments);

// 2. Initialize payment record for a milestone (CLIENT only)
router.post(
    "/milestone/:milestoneId",
    authorizationMiddleware([UserRole.CLIENT]),
    validateMilestoneIdParam,
    createMilestonePayment
);

// 3. Pay milestone using saved payment method (CLIENT only)
router.post(
    "/:paymentId/pay",
    authorizationMiddleware([UserRole.CLIENT]),
    validatePaymentIdParam,
    validatePayMilestoneBody,
    payMilestone
);

// 4. Refund payment (CLIENT or ADMIN)
router.post(
    "/:paymentId/refund",
    authorizationMiddleware([UserRole.CLIENT, UserRole.ADMIN]),
    validatePaymentIdParam,
    validateRefundPaymentBody,
    refundPayment
);

// 5. Get single payment details by ID (CLIENT, FREELANCER, ADMIN)
router.get("/:paymentId", validatePaymentIdParam, getPaymentById);

export default router;
