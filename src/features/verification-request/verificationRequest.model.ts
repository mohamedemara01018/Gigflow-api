import { Schema, model, Types } from "mongoose";
import { DocumentType, VerificationStatus } from "../../utils/enums.utils.js";



const verificationRequestSchema = new Schema(
    {
        user: {
            type: Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        documentType: {
            type: String,
            enum: Object.values(DocumentType),
            required: true,
        },

        status: {
            type: String,
            enum: Object.values(VerificationStatus),
            default: VerificationStatus.PENDING,
            index: true,
        },

        submittedAt: {
            type: Date,
            default: Date.now,
        },

        reviewedBy: {
            type: Types.ObjectId,
            ref: "User", // Admin
            default: null,
        },

        reviewedAt: {
            type: Date,
            default: null,
        },

        rejectionReason: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null,
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

/**
 * One active verification request per user.
 */
verificationRequestSchema.index(
    { user: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: {
                $in: [
                    VerificationStatus.PENDING,
                    VerificationStatus.IN_REVIEW,
                ],
            },
        },
    }
);

/**
 * Admin dashboard
 */
verificationRequestSchema.index({
    status: 1,
    createdAt: -1,
});

/**
 * User history
 */
verificationRequestSchema.index({
    user: 1,
    createdAt: -1,
});

export const VerificationRequest = model(
    "VerificationRequest",
    verificationRequestSchema
);