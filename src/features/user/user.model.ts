import { Schema, model } from "mongoose";
import { UserRole, UserStatus } from "../../utils/enums.utils";

const userSchema = new Schema(
    {
        firstName: {
            type: String,
            required: true,
            trim: true,
        },

        lastName: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        password: {
            type: String,
            required: true,
        },

        role: {
            type: String,
            enum: Object.values(UserRole),
            default: UserRole.CLIENT,
        },

        avatar: {
            type: String,
            default: null,
        },

        public_id: {
            type: String,
            default: null,
        },

        phone: {
            type: String,
            default: null,
        },

        country: {
            type: Schema.Types.ObjectId,
            ref: "Country",
            default: null,
        },

        city: {
            type: Schema.Types.ObjectId,
            ref: "City",
            default: null,
        },

        isOnline: {
            type: Boolean,
            default: false
        },
        lastSeen: {
            type: Date,
            default: Date.now
        },

        verifiedEmailCode: {
            type: String,
            default: null,
        },

        emailCodeExpiresAt: {
            type: String,
        },

        verifiedPhoneCode: {
            type: String,
            default: null,
        },

        phoneCodeExpiresAt: {
            type: String,
        },

        resetToken: {
            type: String,
            default: null,
        },
        resetTokenExpiresAt: {
            type: String,
            default: null,
        },

        isEmailVerified: {
            type: Boolean,
            default: false,
        },

        isPhoneVerified: {
            type: Boolean,
            default: false,
        },

        isIdentityVerified: {
            type: Boolean,
            default: false,
        },

        twoFactorEnabled: {
            type: Boolean,
            default: false,
        },

        provider: {
            type: String,
            enum: ["local", "google"],
            default: "local",
        },

        providerId: {
            type: String,
            default: null,
        },

        status: {
            type: String,
            enum: Object.values(UserStatus),
            default: UserStatus.ACTIVE,
        },

        lastLoginAt: Date,

        refreshTokenVersion: {
            type: Number,
            default: 0,
        },

        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

userSchema.index({
    firstName: "text",
    lastName: "text",
    email: "text",
});

userSchema.index({
    role: 1,
    status: 1,
});

userSchema.index({
    isIdentityVerified: 1,
});

userSchema.index({
    createdAt: -1,
});

export const User = model("User", userSchema);