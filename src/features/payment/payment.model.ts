
import { Schema, model, Types } from "mongoose";

export enum PaymentStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    PAID = "paid",
    FAILED = "failed",
    REFUNDED = "refunded",
    PARTIALLY_REFUNDED = "partially_refunded",
    CANCELLED = "cancelled",
}

export enum PaymentType {
    MILESTONE = "milestone",
    CONTRACT = "contract",
}

export enum PaymentMethod {
    CARD = "card",
    US_BANK_ACCOUNT = "us_bank_account",
    PAYPAL = "paypal",
}

const paymentSchema = new Schema(
    {
        /*
         * GigFlow Relations
         */

        contract: {
            type: Types.ObjectId,
            ref: "Contract",
            required: true,
            index: true,
        },

        milestone: {
            type: Types.ObjectId,
            ref: "Milestone",
            default: null,
        },

        client: {
            type: Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        freelancer: {
            type: Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        /*
         * Payment Information
         */

        type: {
            type: String,
            enum: Object.values(PaymentType),
            default: PaymentType.MILESTONE,
            required: true,
            index: true,
        },

        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        platformFee: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },

        freelancerAmount: {
            type: Number,
            required: true,
            min: 0,
        },

        currency: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
            default: "USD",
            minlength: 3,
            maxlength: 3,
        },

        /*
         * Payment Method
         */

        method: {
            type: String,
            enum: Object.values(PaymentMethod),
            required: true,
            index: true,
        },

        /*
         * Payment Status
         */

        status: {
            type: String,
            enum: Object.values(PaymentStatus),
            default: PaymentStatus.PENDING,
            required: true,
            index: true,
        },

        /*
         * Stripe Identifiers
         */

        stripePaymentIntentId: {
            type: String,
            default: null,
            trim: true,
        },

        stripeChargeId: {
            type: String,
            default: null,
            trim: true,
        },

        stripeTransferId: {
            type: String,
            default: null,
            trim: true,
        },

        /*
         * Transaction
         */

        transactionId: {
            type: Types.ObjectId,
            ref: "Transaction",
            default: null,
            index: true,
        },

        /*
         * Payment Dates
         */

        paidAt: {
            type: Date,
            default: null,
        },

        releasedAt: {
            type: Date,
            default: null,
            index: true,
        },

        failedAt: {
            type: Date,
            default: null,
        },

        /*
         * Failure
         */

        failureReason: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null,
        },

        /*
         * Refund
         */

        refundedAt: {
            type: Date,
            default: null,
        },

        refundAmount: {
            type: Number,
            min: 0,
            default: 0,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

/*
 * Partial Unique Indexes
 */

// One Payment per milestone when milestone is an ObjectId.
paymentSchema.index(
    { milestone: 1 },
    {
        name: "milestone_1",
        unique: true,
        partialFilterExpression: {
            milestone: { $type: "objectId" },
        },
    }
);

// Unique Stripe PaymentIntent IDs when the field contains a string.
paymentSchema.index(
    { stripePaymentIntentId: 1 },
    {
        name: "stripePaymentIntentId_1",
        unique: true,
        partialFilterExpression: {
            stripePaymentIntentId: { $type: "string" },
        },
    }
);

// Unique Stripe Charge IDs when the field contains a string.
paymentSchema.index(
    { stripeChargeId: 1 },
    {
        name: "stripeChargeId_1",
        unique: true,
        partialFilterExpression: {
            stripeChargeId: { $type: "string" },
        },
    }
);

/*
 * Query and Sorting Indexes
 */

paymentSchema.index({ client: 1, createdAt: -1 });
paymentSchema.index({ freelancer: 1, createdAt: -1 });
paymentSchema.index({ contract: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ type: 1, createdAt: -1 });
paymentSchema.index({ method: 1, createdAt: -1 });

export const Payment = model("Payment", paymentSchema);

/**
 * Synchronizes indexes after MongoDB has connected.
 *
 * Note: syncIndexes() may drop indexes that exist in MongoDB
 * but are not declared in this schema. Review database indexes
 * before running this in production.
 */
export const syncPaymentIndexes = async (): Promise<void> => {
    try {
        await Payment.syncIndexes();
        console.log("Payment indexes synchronized successfully.");
    } catch (error) {
        console.error("Error synchronizing payment indexes:", error);
        throw error;
    }
};

export default Payment;