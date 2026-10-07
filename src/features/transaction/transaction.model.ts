import { Schema, model, Types } from "mongoose";

export enum TransactionType {
    CLIENT_PAYMENT = "client_payment",
    PLATFORM_FEE = "platform_fee",
    FREELANCER_PAYOUT = "freelancer_payout",
    REFUND = "refund",
    PARTIAL_REFUND = "partial_refund",
}

export enum TransactionStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled",
}

export enum TransactionDirection {
    CREDIT = "credit",
    DEBIT = "debit",
}

const transactionSchema = new Schema(
    {
        /*
        |--------------------------------------------------------------------------
        | Transaction Type
        |--------------------------------------------------------------------------
        */

        type: {
            type: String,
            enum: Object.values(TransactionType),
            required: true,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Transaction Status
        |--------------------------------------------------------------------------
        */

        status: {
            type: String,
            enum: Object.values(TransactionStatus),
            default: TransactionStatus.PENDING,
            required: true,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Money
        |--------------------------------------------------------------------------
        */

        amount: {
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
        | Direction
        |--------------------------------------------------------------------------
        |
        | CREDIT → money enters the account/ledger
        | DEBIT  → money leaves the account/ledger
        |
        */

        direction: {
            type: String,
            enum: Object.values(TransactionDirection),
            required: true,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Users
        |--------------------------------------------------------------------------
        */

        client: {
            type: Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        freelancer: {
            type: Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | GigFlow Relations
        |--------------------------------------------------------------------------
        */

        contract: {
            type: Types.ObjectId,
            ref: "Contract",
            default: null,
            index: true,
        },

        milestone: {
            type: Types.ObjectId,
            ref: "Milestone",
            default: null,
            index: true,
        },

        payment: {
            type: Types.ObjectId,
            ref: "Payment",
            default: null,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Stripe References
        |--------------------------------------------------------------------------
        */

        stripePaymentIntentId: {
            type: String,
            default: null,
            index: true,
        },

        stripeChargeId: {
            type: String,
            default: null,
            index: true,
        },

        stripeTransferId: {
            type: String,
            default: null,
            index: true,
        },

        stripeRefundId: {
            type: String,
            default: null,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Description
        |--------------------------------------------------------------------------
        */

        description: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null,
        },

        /*
        |--------------------------------------------------------------------------
        | Failure Information
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
        | Completion
        |--------------------------------------------------------------------------
        */

        completedAt: {
            type: Date,
            default: null,
        },

        failedAt: {
            type: Date,
            default: null,
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

transactionSchema.index({
    client: 1,
    createdAt: -1,
});

transactionSchema.index({
    freelancer: 1,
    createdAt: -1,
});

transactionSchema.index({
    contract: 1,
    createdAt: -1,
});

transactionSchema.index({
    milestone: 1,
    createdAt: -1,
});

transactionSchema.index({
    payment: 1,
    createdAt: -1,
});

transactionSchema.index({
    type: 1,
    createdAt: -1,
});

transactionSchema.index({
    status: 1,
    createdAt: -1,
});

export const Transaction = model("Transaction", transactionSchema);
export default Transaction;