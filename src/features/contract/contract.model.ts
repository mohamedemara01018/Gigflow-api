import { Schema, model, Types } from "mongoose";
import { ContractStatus, ContractType } from "../../utils/enums.utils.js";



const contractSchema = new Schema(
    {
        job: {
            type: Types.ObjectId,
            ref: "Job",
            required: true,
            index: true,
        },

        proposal: {
            type: Types.ObjectId,
            ref: "Proposal",
            required: true,
            unique: true,
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

        type: {
            type: String,
            enum: Object.values(ContractType),
            required: true,
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

        totalAmount: {
            type: Number,
            required: true,
            min: 0,
        },

        startDate: {
            type: Date,
            default: null,
        },

        endDate: {
            type: Date,
            default: null,
        },

        status: {
            type: String,
            enum: Object.values(ContractStatus),
            default: ContractStatus.DRAFT,
            index: true,
        },

        sentToFreelancer: {
            type: Boolean,
            default: false,
            index: true,
        },

        sentAt: {
            type: Date,
            default: null,
        },

        clientAcceptedAt: {
            type: Date,
            default: null,
        },

        freelancerAcceptedAt: {
            type: Date,
            default: null,
        },

        rejectedAt: {
            type: Date,
            default: null,
        },

        rejectedBy: {
            type: Types.ObjectId,
            ref: "User",
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

        cancelledAt: {
            type: Date,
            default: null,
        },

        cancellationReason: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Client's contracts
contractSchema.index({
    client: 1,
    createdAt: -1,
});

// Freelancer's contracts
contractSchema.index({
    freelancer: 1,
    createdAt: -1,
});

// Contracts by status
contractSchema.index({
    status: 1,
    createdAt: -1,
});

// Contracts belonging to a job
contractSchema.index({
    job: 1,
});

// One contract per proposal
contractSchema.index(
    {
        proposal: 1,
    },
    {
        unique: true,
    }
);

export const Contract = model("Contract", contractSchema);