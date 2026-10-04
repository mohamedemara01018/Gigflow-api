import mongoose from "mongoose";
import { LanguageLevel } from "../../utils/enums.utils";

const languageSchema = new mongoose.Schema(
    {
        profile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        level: {
            type: String,
            enum: Object.values(LanguageLevel),
            required: true,
        },
    },
);


export const Language = mongoose.model('Language', languageSchema)