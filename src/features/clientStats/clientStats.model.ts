import mongoose, { Document, Schema, Types } from "mongoose";


const clientStatsSchema = new Schema(
    {
        client: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true,
        },

        paymentVerified: {
            type: Boolean,
            default: false,
        },

        hireRate: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },

        rating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },

        totalReviews: {
            type: Number,
            default: 0,
            min: 0,
        },

        totalSpent: {
            type: Number,
            default: 0,
            min: 0,
        },

        totalJobsPosted: {
            type: Number,
            default: 0,
            min: 0,
        },

        totalJobsHired: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    {
        timestamps: true,
    }
);

export const ClientStats = mongoose.model(
    "ClientStats",
    clientStatsSchema
);