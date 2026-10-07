import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { appError } from "../../utils/appError.utils.js";
import { statusText, UserRole } from "../../utils/enums.utils.js";
import {
    payMilestoneService,
    createOrGetMilestonePaymentRecord,
    getPaymentByIdService,
    getUserPaymentsService,
    refundPaymentService,
} from "./payment.service.js";

// ==========================================
// 1. PAY MILESTONE (CLIENT ONLY)
// ==========================================
export const payMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();
        const currentUserRole = req.currentUser?.role;
        const { paymentId } = req.params;
        const { paymentMethodId } = req.body || {};

        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (currentUserRole !== UserRole.CLIENT) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "Only clients are authorized to pay milestones",
                    statusText: statusText.FAIL,
                })
            );
        }

        const result = await payMilestoneService(currentUserId, String(paymentId), paymentMethodId);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: result.message,
            data: result,
        });
    }
);

// ==========================================
// 2. CREATE / INITIALIZE MILESTONE PAYMENT RECORD (CLIENT ONLY)
// ==========================================
export const createMilestonePayment = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();
        const currentUserRole = req.currentUser?.role;
        const { milestoneId } = req.params;
        const { method } = req.body || {};

        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (currentUserRole !== UserRole.CLIENT) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "Only clients can initialize milestone payments",
                    statusText: statusText.FAIL,
                })
            );
        }

        const payment = await createOrGetMilestonePaymentRecord(
            currentUserId,
            String(milestoneId),
            method
        );

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Milestone payment record initialized successfully",
            data: {
                payment,
            },
        });
    }
);

// ==========================================
// 3. GET SINGLE PAYMENT BY ID
// ==========================================
export const getPaymentById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();
        const currentUserRole = req.currentUser?.role;
        const { paymentId } = req.params;

        if (!currentUserId || !currentUserRole) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const payment = await getPaymentByIdService(
            currentUserId,
            currentUserRole,
            String(paymentId)
        );

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Payment details retrieved successfully",
            data: {
                payment,
            },
        });
    }
);

// ==========================================
// 4. GET USER PAYMENTS (PAGINATED WITH FILTERS)
// ==========================================
export const getUserPayments = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();
        const currentUserRole = req.currentUser?.role;

        if (!currentUserId || !currentUserRole) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const {
            status,
            type,
            contract,
            milestone,
            startDate,
            endDate,
            page,
            limit,
            clientId,
            freelancerId,
        } = req.query;

        const result = await getUserPaymentsService({
            userId: currentUserId,
            userRole: currentUserRole,
            status: status as string,
            type: type as string,
            contract: contract as string,
            milestone: milestone as string,
            startDate: startDate as string,
            endDate: endDate as string,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 10,
            clientId: clientId as string,
            freelancerId: freelancerId as string,
        });

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Payments fetched successfully",
            data: result,
        });
    }
);

// ==========================================
// 5. REFUND PAYMENT (CLIENT & ADMIN)
// ==========================================
export const refundPayment = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();
        const currentUserRole = req.currentUser?.role;
        const { paymentId } = req.params;
        const { amount, reason } = req.body || {};

        if (!currentUserId || !currentUserRole) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const result = await refundPaymentService(
            currentUserId,
            currentUserRole,
            String(paymentId),
            amount ? Number(amount) : undefined,
            reason
        );

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Payment refund processed successfully",
            data: result,
        });
    }
);
