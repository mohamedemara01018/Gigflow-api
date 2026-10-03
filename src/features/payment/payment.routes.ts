import { Router } from "express";
import * as paymentController from "./payment.controller.js";
import { authenticationMiddleware } from "../../middleware/authentication.middleware.js";
import { authorizationMiddleware } from "../../middleware/authorization.middleware.js";
import { UserRole } from "../../utils/enums.utils.js";

const router = Router();

// All payment routes are protected
router.use(authenticationMiddleware);

// POST /api/payment - Create payment intent/record (Client only)
router.post(
    "/",
    authorizationMiddleware([UserRole.CLIENT]),
    paymentController.createPayment
);

// GET /api/payment - Get user's payment history
router.get("/", paymentController.getAllPayments);

// GET /api/payment/contract/:contractId - Get payments for a contract
router.get("/contract/:contractId", paymentController.getPaymentsByContract);

// PATCH /api/payment/:id/process - Confirm/Complete payment
router.patch("/:id/process", paymentController.processPayment);

// PATCH /api/payment/:id/refund - Process full or partial refund (Client/Admin)
router.patch(
    "/:id/refund",
    authorizationMiddleware([UserRole.CLIENT, UserRole.ADMIN]),
    paymentController.refundPayment
);

// GET /api/payment/:id - Get single payment details
router.get("/:id", paymentController.getPaymentById);

export default router;