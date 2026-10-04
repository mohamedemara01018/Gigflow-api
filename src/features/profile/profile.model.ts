import mongoose from "mongoose";
import { AvailabilityStatus, ExperienceLevel, ProfileVisibility } from "../../utils/enums.utils.js";
import { IProfileInput } from "../../types/schemeTypes.js";


const socialSchema = new mongoose.Schema(
    {
        website: String,
        github: String,
        linkedin: String,
        twitter: String,
        facebook: String,
        portfolio: String,
    },
    { _id: false }
);

const profileSchema = new mongoose.Schema<IProfileInput>(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true,
        },

        title: {
            type: String,
            trim: true,
            maxlength: 100,
        },

        bio: {
            type: String,
            maxlength: 5000,
        },

        overview: {
            type: String,
            maxlength: 5000,
        },

        hourlyRate: {
            type: Number,
            min: 0,
            default: 0,
        },

        experienceLevel: {
            type: String,
            enum: Object.values(ExperienceLevel),
            default: ExperienceLevel.ENTRY,
        },

        availability: {
            type: String,
            enum: Object.values(AvailabilityStatus),
            default: AvailabilityStatus.AVAILABLE,
        },

        responseTime: {
            type: Number,
            default: 24,
        },

        completedJobs: {
            type: Number,
            default: 0,
        },

        totalHours: {
            type: Number,
            default: 0,
        },

        totalEarnings: {
            type: Number,
            default: 0,
        },

        totalReviews: {
            type: Number,
            default: 0,
        },

        averageRating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },

        successScore: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },

        socialLinks: socialSchema,

        isProfileCompleted: {
            type: Boolean,
            default: false,
        },

        profileViews: {
            type: Number,
            default: 0,
        },

        visibility: {
            type: String,
            enum: Object.values(ProfileVisibility),
            default: ProfileVisibility.PUBLIC,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

profileSchema.index({ skills: 1 });
profileSchema.index({ experienceLevel: 1 });
profileSchema.index({ hourlyRate: 1 });
profileSchema.index({ averageRating: -1 });
profileSchema.index({ successScore: -1 });
profileSchema.index({ availability: 1 });

export const Profile = mongoose.model("Profile", profileSchema);