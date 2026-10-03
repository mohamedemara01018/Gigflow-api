import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { appError } from "../../utils/appError.utils.js";
import { statusText } from "../../utils/enums.utils.js";
import { stripe } from "../../config/stripe.js";
import {
    createSetupIntentService,
    getUserPaymentMethodsService,
    getPaymentMethodByIdService,
    syncOrSavePaymentMethodService,
    setDefaultPaymentMethodService,
    deletePaymentMethodService,
    createConnectOnboardingLinkService,
    getConnectAccountStatusService,
    createConnectDashboardLinkService,
    handleSetupIntentSucceededWebhook,
    handleAccountUpdatedWebhook,
} from "./paymentMethod.service.js";
import Stripe from "stripe";

// ==========================================
// 1. CREATE SETUP INTENT
// ==========================================
export const createSetupIntent = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();

        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const setupIntentData = await createSetupIntentService(currentUserId);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "SetupIntent created successfully",
            data: setupIntentData,
        });
    }
);

// ==========================================
// 2. GET ALL PAYMENT METHODS FOR CURRENT USER
// ==========================================
export const getAllPaymentMethods = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();

        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const paymentMethods = await getUserPaymentMethodsService(currentUserId);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Payment methods retrieved successfully",
            data: {
                paymentMethods,
            },
        });
    }
);

// ==========================================
// 3. GET SINGLE PAYMENT METHOD BY ID
// ==========================================
export const getPaymentMethodById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();
        const { id } = req.params;

        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const paymentMethod = await getPaymentMethodByIdService(currentUserId, String(id));

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Payment method retrieved successfully",
            data: {
                paymentMethod,
            },
        });
    }
);

// ==========================================
// 4. CREATE / SYNC PAYMENT METHOD
// ==========================================
export const createPaymentMethod = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();
        const { stripePaymentMethodId, setupIntentId } = req.body;

        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (!stripePaymentMethodId && !setupIntentId) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "stripePaymentMethodId or setupIntentId is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        const paymentMethod = await syncOrSavePaymentMethodService(
            currentUserId,
            stripePaymentMethodId,
            setupIntentId
        );

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Payment method added successfully",
            data: {
                paymentMethod,
            },
        });
    }
);

// ==========================================
// 5. SET DEFAULT PAYMENT METHOD
// ==========================================
export const setDefaultPaymentMethod = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();
        const { id } = req.params;

        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const paymentMethod = await setDefaultPaymentMethodService(currentUserId, String(id));

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Default payment method updated successfully",
            data: {
                paymentMethod,
            },
        });
    }
);

// ==========================================
// 6. DELETE / DEACTIVATE PAYMENT METHOD
// ==========================================
export const deletePaymentMethod = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();
        const { id } = req.params;

        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        await deletePaymentMethodService(currentUserId, String(id));

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Payment method removed successfully",
            data: {
                message: "Payment method deleted successfully",
            },
        });
    }
);

// ==========================================
// 7. STRIPE CONNECT ONBOARDING FOR FREELANCER
// ==========================================
export const createConnectOnboardingLink = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();

        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const result = await createConnectOnboardingLinkService(currentUserId);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Stripe Connect onboarding link created successfully",
            url: result.url,
            data: result,
        });
    }
);

// ==========================================
// 8. GET STRIPE CONNECT ACCOUNT STATUS
// ==========================================
export const getConnectAccountStatus = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();

        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const data = await getConnectAccountStatusService(currentUserId);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Stripe Connect status retrieved successfully",
            data,
        });
    }
);

// ==========================================
// 9. STRIPE CONNECT DASHBOARD LINK
// ==========================================
export const createConnectDashboardLink = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();

        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const result = await createConnectDashboardLinkService(currentUserId);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Stripe Connect dashboard login link created successfully",
            url: result.url,
            data: result,
        });
    }
);

// ==========================================
// 10. STRIPE WEBHOOK HANDLER
// ==========================================
export const handleStripeWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    try {
        if (webhookSecret && sig) {
            const rawPayload = (req as any).rawBody || req.body;
            event = stripe.webhooks.constructEvent(rawPayload, sig, webhookSecret);
        } else {
            // Fallback for direct json payload in testing without signature secret
            event = req.body;
        }
    } catch (err: any) {
        console.error(`[Webhook Signature Verification Failed]:`, err.message);
        return next(
            appError({
                statusCode: StatusCodes.BAD_REQUEST,
                message: `Webhook Error: ${err.message}`,
                statusText: statusText.FAIL,
            })
        );
    }

    try {
        switch (event.type) {
            case "setup_intent.succeeded": {
                const setupIntent = event.data.object as Stripe.SetupIntent;
                await handleSetupIntentSucceededWebhook(setupIntent);
                break;
            }
            case "account.updated": {
                const account = event.data.object as Stripe.Account;
                await handleAccountUpdatedWebhook(account);
                break;
            }
            default:
                // Handle unhandled event types gracefully
                break;
        }

        res.status(StatusCodes.OK).json({ received: true });
    } catch (err: any) {
        console.error("[Webhook Handler Error]:", err);
        return next(
            appError({
                statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                message: "Webhook processing error",
                statusText: statusText.ERROR,
            })
        );
    }
};