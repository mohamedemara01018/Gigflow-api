import { StatusCodes } from "http-status-codes";
import { stripe } from "../../config/stripe.js";
import { appError } from "../../utils/appError.utils.js";
import { ContractStatus, MilestoneStatus, statusText, UserRole } from "../../utils/enums.utils.js";
import { Contract } from "../contract/contract.model.js";
import { Milestone } from "../milestone/milestone.model.js";
import { User } from "../user/user.model.js";
import { PaymentMethodModel, IPaymentMethodDocument } from "../payment-method/paymentMethod.model.js";
import { getOrCreateStripeCustomer } from "../payment-method/paymentMethod.service.js";
import { Conversation } from "../conversation/conversation.model.js";
import { getIO } from "../../socket.js";
import Payment, { PaymentMethod, PaymentStatus, PaymentType } from "./payment.model.js";
import Transaction, {
    TransactionDirection,
    TransactionStatus,
    TransactionType,
} from "../transaction/transaction.model.js";
import {
    notifyClientOnPaymentFailed,
    notifyClientOnPaymentSent,
    notifyFreelancerOnPaymentReceived,
    notifyFreelancerOnMilestoneFundsReleased,
} from "./payment.notification.js";
import Stripe from "stripe";

// Default platform fee rate (10% if not configured in environment)
const PLATFORM_FEE_RATE = Number(process.env.PLATFORM_FEE_PERCENTAGE) || 0.1;

export interface IPaymentFilterOptions {
    userId: string;
    userRole: string;
    status?: string;
    type?: string;
    contract?: string;
    milestone?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    clientId?: string;
    freelancerId?: string;
}

/**
 * Creates or retrieves a Payment document for a specific milestone.
 * All monetary values are strictly derived from the database Milestone record.
 */
export const createOrGetMilestonePaymentRecord = async (
    userId: string,
    milestoneId: string,
    paymentMethodType?: PaymentMethod
) => {
    const milestone = await Milestone.findById(milestoneId).populate("contract");
    if (!milestone) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Milestone not found",
            statusText: statusText.FAIL,
        });
    }

    const contract = milestone.contract as any;
    if (!contract) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Associated contract not found",
            statusText: statusText.FAIL,
        });
    }

    // Client ownership check
    if (contract.client.toString() !== userId.toString()) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "You are not authorized to create a payment for this contract",
            statusText: statusText.FAIL,
        });
    }

    // Verify Contract is ACTIVE
    if (contract.status !== ContractStatus.ACTIVE) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: `Cannot pay milestone on an inactive contract. Current contract status: '${contract.status}'`,
            statusText: statusText.FAIL,
        });
    }

    // Check if an existing paid payment already exists for this milestone
    const existingPaidPayment = await Payment.findOne({
        milestone: milestone._id,
        status: PaymentStatus.PAID,
    });

    if (existingPaidPayment) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "This milestone has already been paid",
            statusText: statusText.FAIL,
        });
    }

    // Check for an existing pending/processing payment to reuse
    let payment = await Payment.findOne({
        milestone: milestone._id,
        status: { $in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.FAILED] },
    });

    // Calculate trusted amounts strictly from database milestone
    const amount = Number(milestone.amount);
    const platformFee = Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
    const freelancerAmount = Math.round((amount - platformFee) * 100) / 100;
    const method = paymentMethodType || PaymentMethod.CARD;

    if (!payment) {
        payment = await Payment.create({
            contract: contract._id,
            milestone: milestone._id,
            client: contract.client,
            freelancer: contract.freelancer,
            type: PaymentType.MILESTONE,
            amount,
            platformFee,
            freelancerAmount,
            currency: "USD",
            method,
            status: PaymentStatus.PENDING,
        });
    } else {
        // Ensure trusted amounts are up-to-date with milestone
        payment.amount = amount;
        payment.platformFee = platformFee;
        payment.freelancerAmount = freelancerAmount;
        if (paymentMethodType) {
            payment.method = paymentMethodType;
        }
        await payment.save();
    }

    return payment;
};

/**
 * Pay Milestone Service
 * Validates contract, milestone, client ownership, payment method,
 * calculates trusted platform fees and amounts, and creates/confirms Stripe PaymentIntent.
 */
export const payMilestoneService = async (
    userId: string,
    targetPaymentOrMilestoneId: string,
    requestedPaymentMethodId?: string
) => {
    // 1. Resolve User
    const user = await User.findById(userId);
    if (!user) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "User not found",
            statusText: statusText.FAIL,
        });
    }

    if (user.role !== UserRole.CLIENT) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "Only clients are permitted to make milestone payments",
            statusText: statusText.FAIL,
        });
    }

    // 2. Resolve Payment document (accepts paymentId or milestoneId)
    let payment = await Payment.findById(targetPaymentOrMilestoneId)
        .populate("contract")
        .populate("milestone")
        .populate("client", "_id firstName lastName email stripeCustomerId")
        .populate("freelancer", "_id firstName lastName email stripeConnectAccountId");

    if (!payment) {
        // If not found by Payment ID, check if it's a Milestone ID
        const milestone = await Milestone.findById(targetPaymentOrMilestoneId);
        if (milestone) {
            const newPayment = await createOrGetMilestonePaymentRecord(
                userId,
                milestone._id.toString()
            );

            if (newPayment) {
                payment = await Payment.findById(newPayment._id)
                    .populate("contract")
                    .populate("milestone")
                    .populate("client", "_id firstName lastName email stripeCustomerId")
                    .populate("freelancer", "_id firstName lastName email stripeConnectAccountId");
            }
        }
    }

    if (!payment) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Payment or milestone record not found",
            statusText: statusText.FAIL,
        });
    }

    const contract = payment.contract as any;
    const milestone = payment.milestone as any;
    const client = payment.client as any;
    const freelancer = payment.freelancer as any;

    if (!contract || !milestone) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Associated contract or milestone not found",
            statusText: statusText.FAIL,
        });
    }

    // 3. Verify Client Ownership
    if (client._id.toString() !== userId.toString()) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "You are not authorized to pay for this contract milestone",
            statusText: statusText.FAIL,
        });
    }

    // 4. Verify Payment Status is payable
    if (payment.status === PaymentStatus.PAID) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "This payment has already been completed",
            statusText: statusText.FAIL,
        });
    }

    if (payment.status === PaymentStatus.CANCELLED) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "Cannot pay a cancelled payment record",
            statusText: statusText.FAIL,
        });
    }

    // 5. Verify Contract is ACTIVE
    if (contract.status !== ContractStatus.ACTIVE) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: `Contract must be in active status to fund milestones. Current status: '${contract.status}'`,
            statusText: statusText.FAIL,
        });
    }

    // 6. Verify Milestone belongs to Contract
    const milestoneContractId =
        typeof milestone.contract === "object" ? milestone.contract._id : milestone.contract;

    if (milestoneContractId.toString() !== contract._id.toString()) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "Milestone does not belong to the specified contract",
            statusText: statusText.FAIL,
        });
    }

    // 7. Check if another payment record for this milestone is already paid
    const otherPaid = await Payment.findOne({
        _id: { $ne: payment._id },
        milestone: milestone._id,
        status: PaymentStatus.PAID,
    });

    if (otherPaid) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "This milestone has already been funded in another payment record",
            statusText: statusText.FAIL,
        });
    }

    // 8. Find Client PaymentMethod
    let paymentMethodDoc: IPaymentMethodDocument | null = null;
    if (requestedPaymentMethodId) {
        paymentMethodDoc = await PaymentMethodModel.findOne({
            _id: requestedPaymentMethodId,
            user: userId,
            isActive: true,
        });

        if (!paymentMethodDoc) {
            throw appError({
                statusCode: StatusCodes.BAD_REQUEST,
                message: "Selected payment method not found or does not belong to your account",
                statusText: statusText.FAIL,
            });
        }
    } else {
        paymentMethodDoc = await PaymentMethodModel.findOne({
            user: userId,
            isDefault: true,
            isActive: true,
        });

        if (!paymentMethodDoc) {
            // Fallback to any active payment method for this client
            paymentMethodDoc = await PaymentMethodModel.findOne({
                user: userId,
                isActive: true,
            }).sort({ createdAt: -1 });
        }
    }

    if (!paymentMethodDoc || !paymentMethodDoc.stripePaymentMethodId) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "No active payment method found. Please add a payment method in your payment settings first.",
            statusText: statusText.FAIL,
        });
    }

    // 9. Recalculate trusted financial values strictly from Milestone.amount
    const trustedAmount = Number(milestone.amount);
    if (isNaN(trustedAmount) || trustedAmount <= 0) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "Invalid milestone amount in database",
            statusText: statusText.FAIL,
        });
    }

    const platformFee = Math.round(trustedAmount * PLATFORM_FEE_RATE * 100) / 100;
    const freelancerAmount = Math.round((trustedAmount - platformFee) * 100) / 100;

    payment.amount = trustedAmount;
    payment.platformFee = platformFee;
    payment.freelancerAmount = freelancerAmount;
    payment.method = paymentMethodDoc.type as PaymentMethod;
    payment.currency = "USD";

    // 10. Ensure Client Stripe Customer
    const stripeCustomerId = await getOrCreateStripeCustomer(user);

    // Attach payment method to customer if needed
    try {
        await stripe.paymentMethods.attach(paymentMethodDoc.stripePaymentMethodId, {
            customer: stripeCustomerId,
        });
    } catch {
        // Ignored if already attached to this customer
    }

    // 11. Create or retrieve Stripe PaymentIntent
    let paymentIntent: Stripe.PaymentIntent;
    const amountInCents = Math.round(trustedAmount * 100);

    try {
        if (payment.stripePaymentIntentId) {
            // Retrieve existing PaymentIntent
            paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);

            if (paymentIntent.status === "succeeded") {
                // Fulfill payment synchronously & idempotently
                await fulfillSuccessfulPaymentService(payment._id.toString(), paymentIntent.id);

                return {
                    success: true,
                    message: "Payment already processed successfully",
                    status: "succeeded",
                    clientSecret: paymentIntent.client_secret,
                    paymentId: payment._id,
                    requiresAction: false,
                };
            }

            if (
                paymentIntent.status === "requires_payment_method" ||
                paymentIntent.status === "canceled"
            ) {
                // Re-create new PaymentIntent if previous failed or was cancelled
                paymentIntent = await stripe.paymentIntents.create(
                    {
                        amount: amountInCents,
                        currency: "usd",
                        customer: stripeCustomerId,
                        payment_method: paymentMethodDoc.stripePaymentMethodId,
                        off_session: true,
                        confirm: true,
                        description: `GigFlow Milestone #${milestone.order} - ${milestone.title} (${contract.title})`,
                        metadata: {
                            paymentId: payment._id.toString(),
                            contractId: contract._id.toString(),
                            milestoneId: milestone._id.toString(),
                            clientId: user._id.toString(),
                            freelancerId: freelancer._id.toString(),
                        },
                    },
                    {
                        idempotencyKey: `payment-${payment._id.toString()}-${Date.now()}`,
                    }
                );
            } else if (paymentIntent.status === "requires_confirmation") {
                paymentIntent = await stripe.paymentIntents.confirm(paymentIntent.id, {
                    payment_method: paymentMethodDoc.stripePaymentMethodId,
                    off_session: true,
                });
            }
        } else {
            // Create fresh PaymentIntent
            paymentIntent = await stripe.paymentIntents.create(
                {
                    amount: amountInCents,
                    currency: "usd",
                    customer: stripeCustomerId,
                    payment_method: paymentMethodDoc.stripePaymentMethodId,
                    off_session: true,
                    confirm: true,
                    description: `GigFlow Milestone #${milestone.order} - ${milestone.title} (${contract.title})`,
                    metadata: {
                        paymentId: payment._id.toString(),
                        contractId: contract._id.toString(),
                        milestoneId: milestone._id.toString(),
                        clientId: user._id.toString(),
                        freelancerId: freelancer._id.toString(),
                    },
                },
                {
                    idempotencyKey: `payment-${payment._id.toString()}`,
                }
            );
        }

        // Store PaymentIntent ID
        payment.stripePaymentIntentId = paymentIntent.id;

        // 12. Handle PaymentIntent status
        if (paymentIntent.status === "succeeded") {
            payment.status = PaymentStatus.PROCESSING;
            await payment.save();

            // Authoritative fulfillment
            await fulfillSuccessfulPaymentService(payment._id.toString(), paymentIntent.id);

            return {
                success: true,
                message: "Milestone payment processed successfully",
                status: "succeeded",
                clientSecret: paymentIntent.client_secret,
                paymentId: payment._id,
                requiresAction: false,
            };
        } else if (
            paymentIntent.status === "requires_action" ||
            paymentIntent.status === "requires_confirmation"
        ) {
            payment.status = PaymentStatus.PENDING;
            await payment.save();

            return {
                success: true,
                message: "Additional authentication required to complete payment",
                status: paymentIntent.status,
                clientSecret: paymentIntent.client_secret,
                paymentId: payment._id,
                requiresAction: true,
            };
        } else {
            payment.status = PaymentStatus.PROCESSING;
            await payment.save();

            return {
                success: true,
                message: "Payment is currently processing",
                status: paymentIntent.status,
                clientSecret: paymentIntent.client_secret,
                paymentId: payment._id,
                requiresAction: false,
            };
        }
    } catch (stripeErr: any) {
        console.error("[Stripe Payment Error]:", stripeErr.message);

        payment.status = PaymentStatus.FAILED;
        payment.failedAt = new Date();
        payment.failureReason = stripeErr.message || "Payment processing failed";
        await payment.save();

        await notifyClientOnPaymentFailed(payment, stripeErr.message);

        // Handle specific 3D Secure / authentication required error from Stripe
        if (stripeErr.code === "authentication_required" && stripeErr.raw?.payment_intent) {
            const pi = stripeErr.raw.payment_intent;
            payment.stripePaymentIntentId = pi.id;
            payment.status = PaymentStatus.PENDING;
            await payment.save();

            return {
                success: true,
                message: "3D Secure authentication required",
                status: "requires_action",
                clientSecret: pi.client_secret,
                paymentId: payment._id,
                requiresAction: true,
            };
        }

        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: stripeErr.message || "Payment failed. Please check your payment details or try a different card.",
            statusText: statusText.FAIL,
        });
    }
};

/**
 * Authoritative fulfillment service for successful payments.
 * Ensures idempotent creation of CLIENT_PAYMENT and PLATFORM_FEE transactions,
 * updates Payment and Milestone models, and dispatches notifications.
 */
export const fulfillSuccessfulPaymentService = async (
    paymentIdOrPaymentIntentId: string,
    stripePaymentIntentId?: string,
    chargeId?: string
) => {
    const payment = await Payment.findOne({
        $or: [
            { _id: paymentIdOrPaymentIntentId },
            { stripePaymentIntentId: paymentIdOrPaymentIntentId },
            ...(stripePaymentIntentId ? [{ stripePaymentIntentId }] : []),
        ],
    })
        .populate("contract")
        .populate("milestone")
        .populate("client")
        .populate("freelancer");

    if (!payment) {
        console.warn(
            `[Payment Fulfillment] Payment record not found for: ${paymentIdOrPaymentIntentId}`
        );
        return null;
    }

    // Idempotency check: If already marked PAID and transactions exist, skip duplicate processing
    if (payment.status === PaymentStatus.PAID && payment.transactionId) {
        return payment;
    }

    const now = new Date();
    payment.status = PaymentStatus.PAID;
    payment.paidAt = payment.paidAt || now;
    if (chargeId) {
        payment.stripeChargeId = chargeId;
    }
    if (stripePaymentIntentId) {
        payment.stripePaymentIntentId = stripePaymentIntentId;
    }

    const contract = payment.contract as any;
    const milestone = payment.milestone as any;

    // 1. Idempotently create CLIENT_PAYMENT ledger transaction
    let clientTx = await Transaction.findOne({
        payment: payment._id,
        type: TransactionType.CLIENT_PAYMENT,
    });

    if (!clientTx) {
        clientTx = await Transaction.create({
            type: TransactionType.CLIENT_PAYMENT,
            status: TransactionStatus.COMPLETED,
            amount: payment.amount,
            currency: payment.currency || "USD",
            direction: TransactionDirection.CREDIT,
            client: payment.client ? (payment.client as any)._id : null,
            freelancer: payment.freelancer ? (payment.freelancer as any)._id : null,
            contract: contract ? contract._id : null,
            milestone: milestone ? milestone._id : null,
            payment: payment._id,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            stripeChargeId: payment.stripeChargeId,
            completedAt: now,
            description: `Client payment funded for Milestone #${milestone?.order || 1}: "${milestone?.title || "Milestone"}"`,
        });
    }

    payment.transactionId = clientTx._id;

    // 2. Idempotently create PLATFORM_FEE ledger transaction
    if (payment.platformFee > 0) {
        const existingFeeTx = await Transaction.findOne({
            payment: payment._id,
            type: TransactionType.PLATFORM_FEE,
        });

        if (!existingFeeTx) {
            await Transaction.create({
                type: TransactionType.PLATFORM_FEE,
                status: TransactionStatus.COMPLETED,
                amount: payment.platformFee,
                currency: payment.currency || "USD",
                direction: TransactionDirection.CREDIT,
                client: payment.client ? (payment.client as any)._id : null,
                freelancer: payment.freelancer ? (payment.freelancer as any)._id : null,
                contract: contract ? contract._id : null,
                milestone: milestone ? milestone._id : null,
                payment: payment._id,
                stripePaymentIntentId: payment.stripePaymentIntentId,
                completedAt: now,
                description: `Platform fee for Milestone #${milestone?.order || 1}`,
            });
        }
    }

    await payment.save();

    // 3. Update Milestone status if needed (e.g. from PENDING to IN_PROGRESS)
    if (milestone && milestone.status === MilestoneStatus.PENDING) {
        milestone.status = MilestoneStatus.IN_PROGRESS;
        await milestone.save();
    }

    // 4. Realtime Socket.IO emission to conversation room
    if (contract) {
        try {
            const conversation = await Conversation.findOne({ contract: contract._id });
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("payment:completed", {
                    paymentId: payment._id,
                    milestoneId: milestone?._id,
                    amount: payment.amount,
                    status: payment.status,
                });
                if (milestone) {
                    getIO().to(`conversation:${conversation._id}`).emit("milestone:updated", milestone);
                }
            }
        } catch (socketErr) {
            console.error("Socket emission error during payment fulfillment:", socketErr);
        }
    }

    // 5. Notifications
    await notifyFreelancerOnPaymentReceived(payment, milestone, contract);
    await notifyClientOnPaymentSent(payment, milestone, contract);

    return payment;
};

/**
 * Handles failed PaymentIntents from Stripe webhook or asynchronous failures.
 */
export const handlePaymentFailedService = async (
    paymentIntentId: string,
    failureReason?: string
) => {
    const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId });
    if (!payment) return null;

    if (payment.status === PaymentStatus.PAID) {
        return payment;
    }

    payment.status = PaymentStatus.FAILED;
    payment.failedAt = new Date();
    payment.failureReason = failureReason || "Payment declined";
    await payment.save();

    await notifyClientOnPaymentFailed(payment, failureReason);

    return payment;
};

/**
 * Refund Payment Service
 * Authenticated Client or Admin creates a refund for a previously PAID milestone payment.
 */
export const refundPaymentService = async (
    userId: string,
    userRole: string,
    paymentId: string,
    requestedAmount?: number,
    reason?: string
) => {
    const payment = await Payment.findById(paymentId)
        .populate("contract")
        .populate("milestone")
        .populate("client")
        .populate("freelancer");

    if (!payment) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Payment record not found",
            statusText: statusText.FAIL,
        });
    }

    // Authorization: Client who owns the payment, or Admin
    const clientId = payment.client ? (payment.client as any)._id.toString() : null;
    if (userRole !== UserRole.ADMIN && clientId !== userId.toString()) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "You are not authorized to refund this payment",
            statusText: statusText.FAIL,
        });
    }

    // Verify Payment Status is PAID
    if (payment.status !== PaymentStatus.PAID && payment.status !== PaymentStatus.PARTIALLY_REFUNDED) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: `Only paid payments can be refunded. Current payment status is '${payment.status}'`,
            statusText: statusText.FAIL,
        });
    }

    if (!payment.stripePaymentIntentId) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "No Stripe payment intent found for this payment to process refund",
            statusText: statusText.FAIL,
        });
    }

    // Validate refund amount
    const alreadyRefunded = Number(payment.refundAmount || 0);
    const maxRefundable = Math.max(0, Math.round((payment.amount - alreadyRefunded) * 100) / 100);

    if (maxRefundable <= 0) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "This payment has already been fully refunded",
            statusText: statusText.FAIL,
        });
    }

    const refundAmount =
        requestedAmount && requestedAmount > 0
            ? Math.min(requestedAmount, maxRefundable)
            : maxRefundable;

    // Call Stripe API to issue refund
    let stripeRefund: Stripe.Refund;
    try {
        stripeRefund = await stripe.refunds.create({
            payment_intent: payment.stripePaymentIntentId,
            amount: Math.round(refundAmount * 100), // in cents
            reason: "requested_by_customer",
            metadata: {
                paymentId: payment._id.toString(),
                refundedBy: userId,
                reason: reason || "Client milestone refund",
            },
        });
    } catch (stripeErr: any) {
        console.error("[Stripe Refund Error]:", stripeErr);
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: stripeErr.message || "Failed to process refund with payment gateway",
            statusText: statusText.FAIL,
        });
    }

    // Update Payment Record
    const newRefundTotal = Math.round((alreadyRefunded + refundAmount) * 100) / 100;
    payment.refundAmount = newRefundTotal;
    payment.refundedAt = new Date();
    payment.status =
        newRefundTotal >= payment.amount
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED;

    await payment.save();

    // Create Ledger Transaction for REFUND
    const refundTxType =
        payment.status === PaymentStatus.REFUNDED
            ? TransactionType.REFUND
            : TransactionType.PARTIAL_REFUND;

    const refundTx = await Transaction.create({
        type: refundTxType,
        status: TransactionStatus.COMPLETED,
        amount: refundAmount,
        currency: payment.currency || "USD",
        direction: TransactionDirection.DEBIT,
        client: payment.client ? (payment.client as any)._id : null,
        freelancer: payment.freelancer ? (payment.freelancer as any)._id : null,
        contract: payment.contract ? (payment.contract as any)._id : null,
        milestone: payment.milestone ? (payment.milestone as any)._id : null,
        payment: payment._id,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        stripeRefundId: stripeRefund.id,
        completedAt: new Date(),
        description: `Refund of $${refundAmount} for Milestone payment: ${reason || "Client refund requested"}`,
    });

    return {
        payment,
        transaction: refundTx,
        stripeRefundId: stripeRefund.id,
    };
};

/**
 * Get Single Payment by ID with strict role-based access
 */
export const getPaymentByIdService = async (
    userId: string,
    userRole: string,
    paymentId: string
) => {
    const payment = await Payment.findById(paymentId)
        .populate("contract", "title status totalAmount type")
        .populate("milestone", "title amount order status dueDate")
        .populate("client", "firstName lastName email")
        .populate("freelancer", "firstName lastName email")
        .select("-__v");

    if (!payment) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Payment not found",
            statusText: statusText.FAIL,
        });
    }

    const clientId = payment.client ? (payment.client as any)._id.toString() : null;
    const freelancerId = payment.freelancer ? (payment.freelancer as any)._id.toString() : null;

    if (userRole === UserRole.CLIENT && clientId !== userId.toString()) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "You are not authorized to view this payment",
            statusText: statusText.FAIL,
        });
    }

    if (userRole === UserRole.FREELANCER && freelancerId !== userId.toString()) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "You are not authorized to view this payment",
            statusText: statusText.FAIL,
        });
    }

    return payment;
};

/**
 * Get Paginated Payments for current user with filtering
 */
export const getUserPaymentsService = async (options: IPaymentFilterOptions) => {
    const {
        userId,
        userRole,
        status,
        type,
        contract,
        milestone,
        startDate,
        endDate,
        page = 1,
        limit = 10,
        clientId,
        freelancerId,
    } = options;

    const query: any = {};

    // Role-based automatic filtering
    if (userRole === UserRole.CLIENT) {
        query.client = userId;
    } else if (userRole === UserRole.FREELANCER) {
        query.freelancer = userId;
    } else if (userRole === UserRole.ADMIN) {
        if (clientId) query.client = clientId;
        if (freelancerId) query.freelancer = freelancerId;
    }

    // Optional filters
    if (status && Object.values(PaymentStatus).includes(status as PaymentStatus)) {
        query.status = status;
    }

    if (type && Object.values(PaymentType).includes(type as PaymentType)) {
        query.type = type;
    }

    if (contract) {
        query.contract = contract;
    }

    if (milestone) {
        query.milestone = milestone;
    }

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const currentPage = Math.max(1, Number(page));
    const pageLimit = Math.min(100, Math.max(1, Number(limit)));
    const skip = (currentPage - 1) * pageLimit;

    const [payments, total] = await Promise.all([
        Payment.find(query)
            .populate("contract", "title status totalAmount")
            .populate("milestone", "title amount order status")
            .populate("client", "firstName lastName email")
            .populate("freelancer", "firstName lastName email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageLimit)
            .select("-__v"),
        Payment.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / pageLimit);

    return {
        payments,
        total,
        page: currentPage,
        totalPages,
        limit: pageLimit,
    };
};

/**
 * Release Milestone Funds Service
 * 
 * Invoked when Client approves a submitted milestone:
 * - Validates client ownership, active contract, milestone submitted/approved status.
 * - Ensures a successful PAID Payment record exists.
 * - Validates financial balance: amount === platformFee + freelancerAmount.
 * - Idempotently creates Stripe Transfer to freelancer's connected Stripe account.
 * - Updates payment (releasedAt, stripeTransferId).
 * - Creates FREELANCER_PAYOUT ledger transaction.
 * - Approves milestone and activates next pending milestone if any.
 * - Auto-completes Contract if all milestones are approved.
 * - Realtime notification & Socket.IO broadcast.
 */
export const releaseMilestoneFundsService = async (
    userId: string,
    milestoneId: string
) => {
    const milestone = await Milestone.findById(milestoneId).populate("contract");
    if (!milestone) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Milestone not found",
            statusText: statusText.FAIL,
        });
    }

    const contract = milestone.contract as any;
    if (!contract) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Associated contract not found",
            statusText: statusText.FAIL,
        });
    }

    // 1. Verify Client Ownership
    const contractClientId =
        contract.client?._id ? contract.client._id.toString() : contract.client.toString();

    if (contractClientId !== userId.toString()) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "Only the client who owns this contract can approve milestones and release funds",
            statusText: statusText.FAIL,
        });
    }

    // 2. Verify Contract is ACTIVE
    if (contract.status !== ContractStatus.ACTIVE) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: `Contract must be in active status to approve milestones. Current contract status: '${contract.status}'`,
            statusText: statusText.FAIL,
        });
    }

    // 3. Verify Milestone is in SUBMITTED status (or already APPROVED for idempotent re-approval)
    if (milestone.status !== MilestoneStatus.SUBMITTED && milestone.status !== MilestoneStatus.APPROVED) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: `Cannot approve milestone in '${milestone.status}' status. Milestone must be SUBMITTED by the freelancer first.`,
            statusText: statusText.FAIL,
        });
    }

    // 4. Find the PAID Payment record for this milestone (or auto-fund via saved payment method if not yet paid)
    let payment: any = await (Payment as any).findOne({
        milestone: milestone._id,
        status: { $in: [PaymentStatus.PAID, "paid", "completed"] },
    });

    if (!payment) {
        // Also check if paid at contract level
        payment = await (Payment as any).findOne({
            contract: contract._id,
            status: { $in: [PaymentStatus.PAID, "paid", "completed"] },
        });
    }

    if (!payment) {
        // Attempt to auto-fund milestone using the client's saved payment method
        const clientPaymentMethod = await PaymentMethodModel.findOne({
            user: userId,
            isActive: true,
        }).sort({ isDefault: -1, createdAt: -1 });

        if (clientPaymentMethod) {
            try {
                await payMilestoneService(userId, milestone._id.toString(), clientPaymentMethod._id.toString());
                payment = await (Payment as any).findOne({
                    milestone: milestone._id,
                    status: { $in: [PaymentStatus.PAID, "paid", "completed"] },
                });
            } catch (autoPayErr: any) {
                console.error("[Auto-fund Milestone Error]:", autoPayErr);
                throw appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: autoPayErr.message || "Failed to fund milestone with your saved payment method.",
                    statusText: statusText.FAIL,
                });
            }
        }
    }

    if (!payment) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "Milestone cannot be approved and released because no completed payment was found. Please add a payment method in Settings -> Payment Methods to fund this milestone.",
            statusText: statusText.FAIL,
        });
    }

    // 5. Validate Financial Consistency
    const expectedTotal = Math.round((Number(payment.platformFee) + Number(payment.freelancerAmount)) * 100) / 100;
    const actualAmount = Math.round(Number(payment.amount) * 100) / 100;

    if (Math.abs(expectedTotal - actualAmount) > 0.01) {
        console.error(
            `[Financial Inconsistency Detected]: Payment ${payment._id} amount (${actualAmount}) !== platformFee (${payment.platformFee}) + freelancerAmount (${payment.freelancerAmount})`
        );
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "Financial amount validation failed for this payment record. Please contact platform support.",
            statusText: statusText.FAIL,
        });
    }

    // 6. Find Freelancer User Record & Verify Stripe Connect
    const freelancerUserId =
        contract.freelancer?._id ? contract.freelancer._id.toString() : contract.freelancer.toString();

    const freelancer = await User.findById(freelancerUserId);
    if (!freelancer) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Assigned freelancer account not found",
            statusText: statusText.FAIL,
        });
    }

    if (!freelancer.stripeConnectAccountId) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "Freelancer has not connected their Stripe account yet. Funds cannot be released until the freelancer completes Stripe Connect onboarding.",
            statusText: statusText.FAIL,
        });
    }

    const now = new Date();

    // 7. Idempotency Check: Has this payment already been released?
    let transferId = payment.stripeTransferId;
    let freelancerPayoutTx = await Transaction.findOne({
        payment: payment._id,
        type: TransactionType.FREELANCER_PAYOUT,
    });

    if (!payment.releasedAt || !transferId || !freelancerPayoutTx) {
        // Execute Stripe Transfer to Freelancer Connected Account
        try {
            const transfer = await stripe.transfers.create(
                {
                    amount: Math.round(payment.freelancerAmount * 100), // in cents
                    currency: (payment.currency || "USD").toLowerCase(),
                    destination: freelancer.stripeConnectAccountId,
                    source_transaction: payment.stripeChargeId || undefined,
                    description: `Release payment for Milestone #${milestone.order}: "${milestone.title}" (Contract: ${contract.title})`,
                    metadata: {
                        paymentId: payment._id.toString(),
                        milestoneId: milestone._id.toString(),
                        contractId: contract._id.toString(),
                        clientId: userId.toString(),
                        freelancerId: freelancer._id.toString(),
                    },
                },
                {
                    idempotencyKey: `milestone-release-${milestone._id.toString()}`,
                }
            );

            transferId = transfer.id;
            payment.stripeTransferId = transfer.id;
            payment.releasedAt = now;
            await payment.save();
        } catch (stripeErr: any) {
            console.error("[Stripe Transfer Error]:", stripeErr);
            throw appError({
                statusCode: StatusCodes.BAD_REQUEST,
                message: stripeErr.message || "Failed to transfer funds to freelancer's Stripe Connect account",
                statusText: statusText.FAIL,
            });
        }

        // Create FREELANCER_PAYOUT Ledger Transaction
        if (!freelancerPayoutTx) {
            freelancerPayoutTx = await Transaction.create({
                type: TransactionType.FREELANCER_PAYOUT,
                status: TransactionStatus.COMPLETED,
                amount: payment.freelancerAmount,
                currency: payment.currency || "USD",
                direction: TransactionDirection.CREDIT,
                client: contract.client,
                freelancer: contract.freelancer,
                contract: contract._id,
                milestone: milestone._id,
                payment: payment._id,
                stripePaymentIntentId: payment.stripePaymentIntentId,
                stripeTransferId: transferId,
                completedAt: now,
                description: `Freelancer payout released for Milestone #${milestone.order}: "${milestone.title}"`,
            });
        }

        // Ensure PLATFORM_FEE Ledger Transaction exists
        if (payment.platformFee > 0) {
            const existingFeeTx = await Transaction.findOne({
                payment: payment._id,
                type: TransactionType.PLATFORM_FEE,
            });

            if (!existingFeeTx) {
                await Transaction.create({
                    type: TransactionType.PLATFORM_FEE,
                    status: TransactionStatus.COMPLETED,
                    amount: payment.platformFee,
                    currency: payment.currency || "USD",
                    direction: TransactionDirection.CREDIT,
                    client: contract.client,
                    freelancer: contract.freelancer,
                    contract: contract._id,
                    milestone: milestone._id,
                    payment: payment._id,
                    stripePaymentIntentId: payment.stripePaymentIntentId,
                    completedAt: now,
                    description: `Platform fee for Milestone #${milestone.order}`,
                });
            }
        }
    }

    // 8. Update Milestone Status to APPROVED
    milestone.status = MilestoneStatus.APPROVED;
    milestone.approvedAt = milestone.approvedAt || now;
    milestone.completedAt = milestone.completedAt || now;
    await milestone.save();

    // 9. Automatically activate next PENDING milestone (if any)
    const nextMilestone = await Milestone.findOne({
        contract: contract._id,
        order: { $gt: milestone.order },
        status: MilestoneStatus.PENDING,
    }).sort({ order: 1 });

    if (nextMilestone) {
        nextMilestone.status = MilestoneStatus.IN_PROGRESS;
        await nextMilestone.save();
    } else {
        // 10. Check if ALL milestones are approved to auto-complete the Contract
        const remainingUnapproved = await Milestone.countDocuments({
            contract: contract._id,
            status: { $ne: MilestoneStatus.APPROVED },
        });

        if (remainingUnapproved === 0) {
            contract.status = ContractStatus.COMPLETED;
            contract.completedAt = now;
            await contract.save();
        }
    }

    // 11. Realtime Socket.IO emission
    try {
        const conversation = await Conversation.findOne({ contract: contract._id });
        if (conversation) {
            getIO().to(`conversation:${conversation._id}`).emit("milestone:updated", milestone);
            getIO().to(`conversation:${conversation._id}`).emit("payment:released", {
                paymentId: payment._id,
                milestoneId: milestone._id,
                freelancerAmount: payment.freelancerAmount,
                transferId,
            });
            if (nextMilestone) {
                getIO().to(`conversation:${conversation._id}`).emit("milestone:updated", nextMilestone);
            }
            if (contract.status === ContractStatus.COMPLETED) {
                getIO().to(`conversation:${conversation._id}`).emit("contract:updated", contract);
            }
        }
    } catch (socketError) {
        console.error("Socket emission failed:", socketError);
    }

    // 12. Dispatch Notifications
    await notifyFreelancerOnMilestoneFundsReleased(payment, milestone, contract);

    const updatedTransactions = await Transaction.find({ payment: payment._id });

    return {
        milestone,
        payment,
        transactions: updatedTransactions,
        contractCompleted: contract.status === ContractStatus.COMPLETED,
        nextMilestoneActivated: nextMilestone ? nextMilestone._id : null,
    };
};
