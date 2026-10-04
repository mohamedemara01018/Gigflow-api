import { Schema, model, Types } from "mongoose";
import { ExperienceLevel, JobDuration, JobStatus, JobType, JobVisibility } from "../../utils/enums.utils.js";



const jobSchema = new Schema(
    {
        client: {
            type: Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        category: {
            type: Types.ObjectId,
            ref: "Category",
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
            required: true,
            maxlength: 10000,
        },

        type: {
            type: String,
            enum: Object.values(JobType),
            required: true,
        },

        budget: {
            type: Number,
            required: true,
            min: 0,
        },

        hourlyRateFrom: {
            type: Number,
            min: 0,
            default: null,
        },

        hourlyRateTo: {
            type: Number,
            min: 0,
            default: null,
        },

        duration: {
            type: String,
            enum: Object.values(JobDuration),
            default: JobDuration.LESS_THAN_1_MONTH,
        },

        experienceLevel: {
            type: String,
            enum: Object.values(ExperienceLevel),
            default: ExperienceLevel.ENTRY,
        },

        visibility: {
            type: String,
            enum: Object.values(JobVisibility),
            default: JobVisibility.PUBLIC,
        },

        location: {
            type: String,
            default: "Worldwide",
        },

        proposalsCount: {
            type: Number,
            default: 0,
        },

        invitesCount: {
            type: Number,
            default: 0,
        },

        hiresCount: {
            type: Number,
            default: 0,
        },

        maxProposals: {
            type: Number,
            default: null,
        },

        status: {
            type: String,
            enum: Object.values(JobStatus),
            default: JobStatus.OPEN,
        },

        featured: {
            type: Boolean,
            default: false,
        },

        paymentVerified: {
            type: Boolean,
            default: false,
        },

        publishedAt: {
            type: Date,
            default: Date.now,
        },

        expiresAt: {
            type: Date,
            default: null,
        },

        closedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

/* ---------------- Indexes ---------------- */

jobSchema.index({ title: "text", description: "text" });

jobSchema.index({
    category: 1,
    experienceLevel: 1,
});

jobSchema.index({
    status: 1,
    visibility: 1,
});

jobSchema.index({
    client: 1,
    createdAt: -1,
});

jobSchema.index({
    budget: 1,
});

export const Job = model("Job", jobSchema);