import mongoose, { Document, Schema, Types } from "mongoose";

export interface IReviewDocument extends Document {
    contract: Types.ObjectId;
    job: Types.ObjectId;
    reviewer: Types.ObjectId;
    reviewee: Types.ObjectId;
    rating: number;
    comment: string;
    createdAt: Date;
    updatedAt: Date;
}

const reviewSchema = new Schema<IReviewDocument>(
    {
        contract: {
            type: Schema.Types.ObjectId,
            ref: "Contract",
            required: true,
            index: true,
        },

        job: {
            type: Schema.Types.ObjectId,
            ref: "Job",
            required: true,
            index: true,
        },

        reviewer: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        reviewee: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },

        comment: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// One review per reviewer per contract
reviewSchema.index(
    {
        contract: 1,
        reviewer: 1,
        reviewee: 1,
    },
    {
        unique: true,
    }
);

reviewSchema.index({ reviewee: 1, createdAt: -1 });

export const Review = mongoose.model<IReviewDocument>("Review", reviewSchema);
export default Review;
