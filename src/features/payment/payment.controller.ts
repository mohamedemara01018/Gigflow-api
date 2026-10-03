import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import Payment from "./payment.model.js";
import { Contract } from "../contract/contract.model.js";
import { Milestone } from "../milestone/milestone.model.js";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { ContractStatus, MilestoneStatus, PaymentStatus, PaymentType, statusText, UserRole } from "../../utils/enums.utils.js";
import { Conversation } from "../conversation/conversation.model.js";
import { getIO } from "../../socket.js";

// Stripe Platform Fee Percentage (e.g., 10%)
const PLATFORM_FEE_PERCENTAGE = 0.1;

// ==========================================
// 1. CREATE PAYMENT INTENT / INITIATE PAYMENT
// ==========================================
export const createPayment = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id;
        const currentUserRole = req.currentUser?.role;

        if (currentUserRole !== UserRole.CLIENT) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "Only clients can initiate payments",
                    statusText: statusText.FAIL,
                })
            );
        }

        const { contractId, milestoneId, type, method } = req.body;

        if (!contractId || !type || !method) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "contractId, type, and method are required",
                    statusText: statusText.FAIL,
                })
            );
        }

        const contract = await Contract.findById(contractId);
        if (!contract) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Contract not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (contract.client.toString() !== currentUserId?.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You are not authorized to make payments for this contract",
                    statusText: statusText.FAIL,
                })
            );
        }

        let amount = 0;
        let targetMilestone = null;

        if (type === PaymentType.MILESTONE) {
            if (!milestoneId) {
                return next(
                    appError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        message: "milestoneId is required for milestone payment type",
                        statusText: statusText.FAIL,
                    })
                );
            }

            targetMilestone = await Milestone.findById(milestoneId);
            if (!targetMilestone) {
                return next(
                    appError({
                        statusCode: StatusCodes.NOT_FOUND,
                        message: "Milestone not found",
                        statusText: statusText.FAIL,
                    })
                );
            }

            amount = targetMilestone.amount;
        } else if (type === PaymentType.CONTRACT) {
            amount = contract.totalAmount;
        } else {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Invalid payment type",
                    statusText: statusText.FAIL,
                })
            );
        }

        const platformFee = Math.round(amount * PLATFORM_FEE_PERCENTAGE * 100) / 100;
        const freelancerAmount = Math.round((amount - platformFee) * 100) / 100;

        // Prevent duplicate pending/completed payments for the same milestone
        if (type === PaymentType.MILESTONE && milestoneId) {
            const existingPayment = await Payment.findOne({
                milestone: milestoneId,
                status: { $in: [PaymentStatus.COMPLETED, PaymentStatus.PROCESSING, PaymentStatus.PENDING] },
            });

            if (existingPayment) {
                return next(
                    appError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        message: `A payment for this milestone is already ${existingPayment.status}`,
                        statusText: statusText.FAIL,
                    })
                );
            }
        }

        const payment = await Payment.create({
            contract: contract._id,
            milestone: milestoneId || null,
            client: currentUserId,
            freelancer: contract.freelancer,
            type,
            amount,
            platformFee,
            freelancerAmount,
            currency: "USD",
            method,
            status: PaymentStatus.PENDING,
        });

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: "Payment initiated successfully",
            data: {
                payment,
            },
        });
    }
);

// ==========================================
// 2. GET ALL PAYMENTS (Filtered by Role)
// ==========================================
export const getAllPayments = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id;
        const currentUserRole = req.currentUser?.role;

        const filter: Record<string, any> = {};

        if (currentUserRole === UserRole.CLIENT) {
            filter.client = currentUserId;
        } else if (currentUserRole === UserRole.FREELANCER) {
            filter.freelancer = currentUserId;
        }

        const payments = await Payment.find(filter)
            .populate("contract", "title status totalAmount")
            .populate("milestone", "title amount status")
            .populate("client", "firstName lastName email")
            .populate("freelancer", "firstName lastName email")
            .sort({ createdAt: -1 });

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Payments retrieved successfully",
            data: {
                payments,
            },
        });
    }
);

// ==========================================
// 3. GET SINGLE PAYMENT BY ID
// ==========================================
export const getPaymentById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const currentUserId = req.currentUser?._id;

        const payment = await Payment.findById(id)
            .populate("contract", "title status totalAmount")
            .populate("milestone", "title amount status")
            .populate("client", "firstName lastName email")
            .populate("freelancer", "firstName lastName email");

        if (!payment) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Payment record not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Authorization check
        const isClient = payment.client._id.toString() === currentUserId?.toString();
        const isFreelancer = payment.freelancer._id.toString() === currentUserId?.toString();

        if (!isClient && !isFreelancer) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You are not authorized to view this payment",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Payment details fetched successfully",
            data: {
                payment,
            },
        });
    }
);

// ==========================================
// 4. GET PAYMENTS BY CONTRACT ID
// ==========================================
export const getPaymentsByContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { contractId } = req.params;

        const contract = await Contract.findById(contractId);
        if (!contract) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Contract not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const payments = await Payment.find({ contract: contractId })
            .populate("milestone", "title amount status")
            .sort({ createdAt: -1 });

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Contract payments retrieved successfully",
            data: {
                payments,
            },
        });
    }
);

// ==========================================
// 5. CONFIRM / PROCESS PAYMENT
// ==========================================
export const processPayment = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { stripePaymentIntentId, stripeChargeId } = req.body;

        const payment = await Payment.findById(id);
        if (!payment) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Payment record not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (payment.status === PaymentStatus.COMPLETED) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Payment has already been completed",
                    statusText: statusText.FAIL,
                })
            );
        }

        const now = new Date();
        payment.status = PaymentStatus.COMPLETED;
        payment.paidAt = now;
        if (stripePaymentIntentId) payment.stripePaymentIntentId = stripePaymentIntentId;
        if (stripeChargeId) payment.stripeChargeId = stripeChargeId;

        await payment.save();

        // Sync milestone or contract status upon successful payment
        if (payment.type === PaymentType.MILESTONE && payment.milestone) {
            await Milestone.findByIdAndUpdate(payment.milestone, {
                status: MilestoneStatus.IN_PROGRESS,
            });
        }

        try {
            const conversation = await Conversation.findOne({ contract: payment.contract });
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("payment:completed", payment);
            }
        } catch (socketError) {
            console.error("Socket emission failed:", socketError);
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Payment completed successfully",
            data: {
                payment,
            },
        });
    }
);

// ==========================================
// 6. PROCESS REFUND
// ==========================================
export const refundPayment = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { refundAmount } = req.body;

        const payment = await Payment.findById(id);
        if (!payment) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Payment record not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (payment.status !== PaymentStatus.COMPLETED) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Only completed payments can be refunded",
                    statusText: statusText.FAIL,
                })
            );
        }

        const amountToRefund = Number(refundAmount) || payment.amount;

        if (amountToRefund > payment.amount) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Refund amount cannot exceed original payment amount",
                    statusText: statusText.FAIL,
                })
            );
        }

        const isPartial = amountToRefund < payment.amount;

        payment.status = isPartial ? PaymentStatus.PARTIALLY_REFUNDED : PaymentStatus.REFUNDED;
        payment.refundAmount = amountToRefund;
        payment.refundedAt = new Date();

        await payment.save();

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: isPartial ? "Payment partially refunded successfully" : "Payment fully refunded successfully",
            data: {
                payment,
            },
        });
    }
);