import { Schema, model, Types, Document } from "mongoose";

export enum PaymentMethod {
    CARD = "card",
    US_BANK_ACCOUNT = "us_bank_account",
    PAYPAL = "paypal",
}

export interface IPaymentMethodCard {
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
}

export interface IPaymentMethodUSBankAccount {
    bankName: string | null;
    last4: string | null;
    accountType: "checking" | "savings" | null;
}

export interface IPaymentMethodPayPal {
    payerId: string | null;
    email: string | null;
}

export interface IPaymentMethodDocument extends Document {
    user: Types.ObjectId;
    stripePaymentMethodId: string;
    type: PaymentMethod | string;
    card?: IPaymentMethodCard;
    usBankAccount?: IPaymentMethodUSBankAccount;
    paypal?: IPaymentMethodPayPal;
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const paymentMethodSchema = new Schema<IPaymentMethodDocument>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        stripePaymentMethodId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        type: {
            type: String,
            enum: Object.values(PaymentMethod),
            required: true,
            index: true,
        },

        card: {
            brand: {
                type: String,
                default: null,
            },

            last4: {
                type: String,
                default: null,
            },

            expMonth: {
                type: Number,
                min: 1,
                max: 12,
                default: null,
            },

            expYear: {
                type: Number,
                default: null,
            },
        },

        usBankAccount: {
            bankName: {
                type: String,
                default: null,
            },

            last4: {
                type: String,
                default: null,
            },

            accountType: {
                type: String,
                enum: ["checking", "savings"],
                default: null,
            },
        },

        paypal: {
            payerId: {
                type: String,
                default: null,
            },

            email: {
                type: String,
                lowercase: true,
                trim: true,
                default: null,
            },
        },

        isDefault: {
            type: Boolean,
            default: false,
            index: true,
        },

        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

paymentMethodSchema.index({
    user: 1,
    createdAt: -1,
});

paymentMethodSchema.index({
    user: 1,
    isActive: 1,
});

paymentMethodSchema.index({
    user: 1,
    isDefault: 1,
});

paymentMethodSchema.index({
    user: 1,
    type: 1,
});

export const PaymentMethodModel = model<IPaymentMethodDocument>(
    "PaymentMethod",
    paymentMethodSchema
);