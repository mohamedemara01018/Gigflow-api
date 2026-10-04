import { Schema, model, Types } from "mongoose";
import { DeliveryDurationUnit, ProposalStatus } from "../../utils/enums.utils.js";



const proposalSchema = new Schema(
    {
        job: {
            type: Types.ObjectId,
            ref: "Job",
            required: true,
            index: true,
        },

        freelancer: {
            type: Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        coverLetter: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000,
        },

        bidAmount: {
            type: Number,
            required: true,
            min: 1,
        },

        estimatedDuration: {
            value: {
                type: Number,
                required: true,
                min: 1,
            },

            unit: {
                type: String,
                enum: Object.values(DeliveryDurationUnit),
                default: DeliveryDurationUnit.DAYS,
            },
        },

        status: {
            type: String,
            enum: Object.values(ProposalStatus),
            default: ProposalStatus.PENDING,
        },

        clientViewed: {
            type: Boolean,
            default: false,
        },

        viewedAt: {
            type: Date,
            default: null,
        },

        withdrawnAt: {
            type: Date,
            default: null,
        },

        acceptedAt: {
            type: Date,
            default: null,
        },

        rejectedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

/**
 * A freelancer can submit only one proposal per job.
 */
proposalSchema.index(
    {
        job: 1,
        freelancer: 1,
    },
    {
        unique: true,
    }
);

/**
 * Useful indexes
 */
proposalSchema.index({
    job: 1,
    status: 1,
});

proposalSchema.index({
    freelancer: 1,
    createdAt: -1,
});

proposalSchema.index({
    bidAmount: 1,
});

export const Proposal = model("Proposal", proposalSchema);