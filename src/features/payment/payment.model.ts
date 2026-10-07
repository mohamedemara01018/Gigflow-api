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
            default: PaymentType.MILESTONE,
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
        | Stripe Identifiers (Nullable with partial unique indexes)
        |--------------------------------------------------------------------------
        */

        stripePaymentIntentId: {
            type: String,
            default: null,
            trim: true,
            index: true,
        },

        stripeChargeId: {
            type: String,
            default: null,
            trim: true,
            index: true,
        },

        stripeTransferId: {
            type: String,
            default: null,
            trim: true,
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
| Partial Unique Indexes (Prevents Null Collisions and Duplicates)
|--------------------------------------------------------------------------
*/

// Guarantees maximum ONE Payment per Milestone
paymentSchema.index(
    { milestone: 1 },
    {
        unique: true,
        partialFilterExpression: {
            milestone: {
                $type: "objectId",
            },
        },
    }
);

// Allows multiple nulls, guarantees uniqueness when a String Stripe PaymentIntent ID exists
paymentSchema.index(
    { stripePaymentIntentId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            stripePaymentIntentId: {
                $type: "string",
            },
        },
    }
);

// Allows multiple nulls, guarantees uniqueness when a String Stripe Charge ID exists
paymentSchema.index(
    { stripeChargeId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            stripeChargeId: {
                $type: "string",
            },
        },
    }
);

/*
|--------------------------------------------------------------------------
| Query & Sorting Indexes
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

/**
 * Safely synchronizes payment indexes by dropping legacy indexes on startup.
 */
export const syncPaymentIndexes = async (): Promise<void> => {
    try {
        const collection = Payment.collection;
        if (!collection) return;

        const existingIndexes = await collection.indexes().catch(() => []);

        for (const idx of existingIndexes) {
            // Drop legacy unique index on stripeChargeId if not partial
            if (idx.name === "stripeChargeId_1" && idx.unique && !idx.partialFilterExpression) {
                console.log("🧹 Dropping legacy unique index: stripeChargeId_1");
                await collection.dropIndex("stripeChargeId_1").catch(() => {});
            }
            // Drop legacy unique index on stripePaymentIntentId if not partial
            if (idx.name === "stripePaymentIntentId_1" && idx.unique && !idx.partialFilterExpression) {
                console.log("🧹 Dropping legacy unique index: stripePaymentIntentId_1");
                await collection.dropIndex("stripePaymentIntentId_1").catch(() => {});
            }
            // Drop legacy milestone_1 index if not partial unique
            if (idx.name === "milestone_1" && (!idx.unique || !idx.partialFilterExpression)) {
                console.log("🧹 Dropping legacy milestone_1 index to apply partial unique index");
                await collection.dropIndex("milestone_1").catch(() => {});
            }
        }

        await Payment.syncIndexes();
        console.log("✅ Payment indexes synchronized successfully.");
    } catch (err) {
        console.warn("⚠️ Error synchronizing payment indexes:", err);
    }
};

// Trigger safe index migration upon module load
syncPaymentIndexes();

export default Payment;