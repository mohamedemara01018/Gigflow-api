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
        |--------------------------------------------------------------------------
        | GigFlow Relations
        |--------------------------------------------------------------------------
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
            index: true,
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
        |--------------------------------------------------------------------------
        | Payment Information
        |--------------------------------------------------------------------------
        */

        type: {
            type: String,
            enum: Object.values(PaymentType),
            required: true,
            index: true,
        },

        // Gross amount charged to the client
        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        // GigFlow platform fee
        platformFee: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },

        // Amount that belongs to the freelancer
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
        |--------------------------------------------------------------------------
        | Payment Method
        |--------------------------------------------------------------------------
        */

        method: {
            type: String,
            enum: Object.values(PaymentMethod),
            required: true,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Payment Status
        |--------------------------------------------------------------------------
        */

        status: {
            type: String,
            enum: Object.values(PaymentStatus),
            default: PaymentStatus.PENDING,
            required: true,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Stripe
        |--------------------------------------------------------------------------
        */

        stripePaymentIntentId: {
            type: String,
            default: null,
            unique: true,
            sparse: true,
            index: true,
        },

        stripeChargeId: {
            type: String,
            default: null,
            unique: true,
            sparse: true,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Transaction
        |--------------------------------------------------------------------------
        */

        transactionId: {
            type: Types.ObjectId,
            ref: "Transaction",
            default: null,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Payment Dates
        |--------------------------------------------------------------------------
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

        stripeTransferId: {
            type: String,
            default: null,
            sparse: true,
            index: true,
        },

        failedAt: {
            type: Date,
            default: null,
        },

        /*
        |--------------------------------------------------------------------------
        | Failure
        |--------------------------------------------------------------------------
        */

        failureReason: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null,
        },

        /*
        |--------------------------------------------------------------------------
        | Refund
        |--------------------------------------------------------------------------
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
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

paymentSchema.index({
    client: 1,
    createdAt: -1,
});

paymentSchema.index({
    freelancer: 1,
    createdAt: -1,
});

paymentSchema.index({
    contract: 1,
    createdAt: -1,
});

paymentSchema.index({
    milestone: 1,
    createdAt: -1,
});

paymentSchema.index({
    status: 1,
    createdAt: -1,
});

paymentSchema.index({
    type: 1,
    createdAt: -1,
});

paymentSchema.index({
    method: 1,
    createdAt: -1,
});

export const Payment = model("Payment", paymentSchema);
export default Payment;