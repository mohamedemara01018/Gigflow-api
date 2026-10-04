import { Schema, model, Types } from "mongoose";
import { PortfolioProjectStatus } from "../../utils/enums.utils.js";


const portfolioItemSchema = new Schema(
    {
        freelancer: {
            type: Types.ObjectId,
            ref: "User",
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
            trim: true,
            maxlength: 5000,
        },

        thumbnail: {
            image: {
                type: String,
                default: null,

            },
            publicId: {
                type: String,
                default: null,

            },
            // required: true
        },

        images: [
            {
                image: {
                    type: String,
                    default: null,

                },
                publicId: {
                    type: String,
                    default: null,

                }
            },
        ],

        technologies: [
            {
                type: Types.ObjectId,
                ref: "Skill",
            },
        ],

        projectUrl: {
            type: String,
            default: null,
        },

        githubUrl: {
            type: String,
            default: null,
        },

        figmaUrl: {
            type: String,
            default: null,
        },

        role: {
            type: String,
            trim: true,
            maxlength: 100,
        },

        completedAt: {
            type: Date,
            default: null,
        },

        status: {
            type: String,
            enum: Object.values(PortfolioProjectStatus),
            default: PortfolioProjectStatus.PUBLISHED,
        },

        featured: {
            type: Boolean,
            default: false,
        },

        views: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

/* ---------------- Indexes ---------------- */

portfolioItemSchema.index({
    freelancer: 1,
    createdAt: -1,
});

portfolioItemSchema.index({
    technologies: 1,
});

portfolioItemSchema.index({
    featured: 1,
});

portfolioItemSchema.index({
    status: 1,
});

export const PortfolioItem = model("PortfolioItem", portfolioItemSchema);