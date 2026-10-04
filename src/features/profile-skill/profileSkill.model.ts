import mongoose from "mongoose";
import { SkillLevel } from "../../utils/enums.utils.js";

const profileSkillSchema = new mongoose.Schema(
    {
        profile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Profile",
            required: true,
            index: true,
        },

        skill: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Skill",
            required: true,
            index: true,
        },

        level: {
            type: String,
            enum: Object.values(SkillLevel),
            default: SkillLevel.BEGINNER,
        },

        yearsOfExperience: {
            type: Number,
            default: 0,
            min: 0,
        },

        isPrimary: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

/**
 * Prevent duplicate skills for the same profile
 */
profileSkillSchema.index(
    {
        profile: 1,
        skill: 1,
    },
    {
        unique: true,
    }
);

profileSkillSchema.index({
    skill: 1,
    level: 1,
});

export default mongoose.model("ProfileSkill", profileSkillSchema);