import { Schema, model, Types } from "mongoose";
import { MilestoneStatus } from "../../utils/enums.utils";



const milestoneSchema = new Schema(
    {
        contract: {
            type: Types.ObjectId,
            ref: "Contract",
            required: true,
            index: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },

        description: {
            type: String,
            trim: true,
            maxlength: 5000,
            default: null,
        },

        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        order: {
            type: Number,
            required: true,
            min: 1,
        },

        dueDate: {
            type: Date,
            default: null,
        },

        status: {
            type: String,
            enum: Object.values(MilestoneStatus),
            default: MilestoneStatus.PENDING,
            index: true,
        },

        submittedAt: {
            type: Date,
            default: null,
        },

        submissionNotes: {
            type: String,
            trim: true,
            maxlength: 5000,
            default: null,
        },

        submissionUrl: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: null,
        },

        approvedAt: {
            type: Date,
            default: null,
        },

        rejectedAt: {
            type: Date,
            default: null,
        },

        rejectionReason: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null,
        },

        completedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Prevent duplicate milestone order inside the same contract
milestoneSchema.index(
    {
        contract: 1,
        order: 1,
    },
    {
        unique: true,
    }
);

// Get milestones of a contract by status
milestoneSchema.index({
    contract: 1,
    status: 1,
});

// Get milestones ordered by their sequence
milestoneSchema.index({
    contract: 1,
    order: 1,
});

export const Milestone = model("Milestone", milestoneSchema);