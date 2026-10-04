import mongoose from "mongoose";
import { EmploymentType } from "../../utils/enums.utils.js";

const employmentHistorySchema = new mongoose.Schema(
    {
        profile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            required: true,
        },
        company: {
            type: String,
            required: true,
            trim: true,
        },
        position: {
            type: String,
            required: true,
            trim: true,
        },
        employmentType: {
            type: String,
            enum: Object.values(EmploymentType),
            default: EmploymentType.FULL_TIME,
        },
        startDate: Date,
        endDate: Date,
        currentlyWorking: {
            type: Boolean,
            default: false,
        },
        description: String,
    },
);

export const EmploymentHistory = mongoose.model('EmploymentHistory', employmentHistorySchema)