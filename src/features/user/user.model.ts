import { Schema, model } from "mongoose";
import { UserRole, UserStatus } from "../../utils/enums.utils";

const userSchema = new Schema(
    {
        /*
        |--------------------------------------------------------------------------
        | Basic Information
        |--------------------------------------------------------------------------
        */

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

        /*
        |--------------------------------------------------------------------------
        | Role
        |--------------------------------------------------------------------------
        */

        role: {
            type: String,
            enum: Object.values(UserRole),
            default: UserRole.CLIENT,
            required: true,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Profile
        |--------------------------------------------------------------------------
        */

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

        /*
        |--------------------------------------------------------------------------
        | Online Presence
        |--------------------------------------------------------------------------
        */

        isOnline: {
            type: Boolean,
            default: false,
        },

        lastSeen: {
            type: Date,
            default: Date.now,
        },

        /*
        |--------------------------------------------------------------------------
        | Email Verification
        |--------------------------------------------------------------------------
        */

        verifiedEmailCode: {
            type: String,
            default: null,
        },

        emailCodeExpiresAt: {
            type: Date,
            default: null,
        },

        /*
        |--------------------------------------------------------------------------
        | Phone Verification
        |--------------------------------------------------------------------------
        */

        verifiedPhoneCode: {
            type: String,
            default: null,
        },

        phoneCodeExpiresAt: {
            type: Date,
            default: null,
        },

        /*
        |--------------------------------------------------------------------------
        | Password Reset
        |--------------------------------------------------------------------------
        */

        resetToken: {
            type: String,
            default: null,
        },

        resetTokenExpiresAt: {
            type: Date,
            default: null,
        },

        /*
        |--------------------------------------------------------------------------
        | Verification
        |--------------------------------------------------------------------------
        */

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

        /*
        |--------------------------------------------------------------------------
        | Two Factor Authentication
        |--------------------------------------------------------------------------
        */

        twoFactorEnabled: {
            type: Boolean,
            default: false,
        },

        /*
        |--------------------------------------------------------------------------
        | OAuth
        |--------------------------------------------------------------------------
        */

        provider: {
            type: String,
            enum: ["local", "google"],
            default: "local",
        },

        providerId: {
            type: String,
            default: null,
        },

        /*
        |--------------------------------------------------------------------------
        | Stripe Customer
        |--------------------------------------------------------------------------
        |
        | Used by CLIENT users to:
        |
        | - Save payment methods
        | - Create SetupIntents
        | - Create PaymentIntents
        | - Make payments
        |
        */

        stripeCustomerId: {
            type: String,
            default: null,
            unique: true,
            sparse: true,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Stripe Connect Account
        |--------------------------------------------------------------------------
        |
        | Used by FREELANCER users to receive payouts.
        |
        */

        stripeConnectAccountId: {
            type: String,
            default: null,
            unique: true,
            sparse: true,
            index: true,
        },

        stripeConnectOnboardingComplete: {
            type: Boolean,
            default: false,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Account Status
        |--------------------------------------------------------------------------
        */

        status: {
            type: String,
            enum: Object.values(UserStatus),
            default: UserStatus.ACTIVE,
            required: true,
            index: true,
        },

        /*
        |--------------------------------------------------------------------------
        | Authentication
        |--------------------------------------------------------------------------
        */

        lastLoginAt: {
            type: Date,
            default: null,
        },

        refreshTokenVersion: {
            type: Number,
            default: 0,
        },

        /*
        |--------------------------------------------------------------------------
        | Soft Delete
        |--------------------------------------------------------------------------
        */

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

/*
|--------------------------------------------------------------------------
| Text Search
|--------------------------------------------------------------------------
*/

userSchema.index({
    firstName: "text",
    lastName: "text",
    email: "text",
});

/*
|--------------------------------------------------------------------------
| Common Filters
|--------------------------------------------------------------------------
*/

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