import { Router } from "express";
import {
    createSetupIntent,
    createPaymentMethod,
    getAllPaymentMethods,
    getPaymentMethodById,
    setDefaultPaymentMethod,
    deletePaymentMethod,
    createConnectOnboardingLink,
    getConnectAccountStatus,
    createConnectDashboardLink,
    handleStripeWebhook,
} from "./paymentMethod.controller.js";
import { authenticationMiddleware } from "../../middleware/authentication.middleware.js";
import { authorizationMiddleware } from "../../middleware/authorization.middleware.js";
import { UserRole } from "../../utils/enums.utils.js";
import {
    validatePaymentMethodIdParam,
    validateCreatePaymentMethodBody,
} from "./paymentMethod.validation.js";

const router = Router();

// ==========================================
// PUBLIC / WEBHOOK ROUTES
// ==========================================
// Stripe Webhook Endpoint (No JWT auth, signature verified in controller)
router.post("/webhook", handleStripeWebhook);

// ==========================================
// PROTECTED ROUTES (CLIENT & FREELANCER)
// ==========================================
router.use(authenticationMiddleware);

// ==========================================
// STRIPE CONNECT ROUTES (FREELANCER ONLY)
// ==========================================
router.post(
    "/connect/onboarding",
    authorizationMiddleware([UserRole.FREELANCER]),
    createConnectOnboardingLink
);

router.get(
    "/connect/status",
    authorizationMiddleware([UserRole.FREELANCER]),
    getConnectAccountStatus
);

router.post(
    "/connect/dashboard",
    authorizationMiddleware([UserRole.FREELANCER]),
    createConnectDashboardLink
);

// ==========================================
// PAYMENT METHOD ROUTES (CLIENT & FREELANCER)
// ==========================================
router.use(authorizationMiddleware([UserRole.CLIENT, UserRole.FREELANCER]));

// 1. Create SetupIntent for adding a payment method
router.post("/setup-intent", createSetupIntent);

// 2. Get all payment methods of the authenticated user
router.get("/", getAllPaymentMethods);

// 3. Create / sync confirmed payment method
router.post("/", validateCreatePaymentMethodBody, createPaymentMethod);

// 4. Get single payment method by ID
router.get("/:id", validatePaymentMethodIdParam, getPaymentMethodById);

// 5. Set payment method as default
router.patch("/:id/default", validatePaymentMethodIdParam, setDefaultPaymentMethod);

// 6. Delete / deactivate payment method
router.delete("/:id", validatePaymentMethodIdParam, deletePaymentMethod);

export default router;