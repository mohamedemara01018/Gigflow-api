import { Schema, model, Types } from "mongoose";
import { ContactSupportCategory, ContactSupportStatus } from "../../utils/enums.utils.js";



const contactSupportSchema = new Schema(
    {
        // Optional because the form can also be submitted by a guest
        user: {
            type: Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        fullName: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100,
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },

        subject: {
            type: String,
            required: true,
            trim: true,
            minlength: 3,
            maxlength: 200,
        },

        category: {
            type: String,
            enum: Object.values(ContactSupportCategory),
            default: ContactSupportCategory.GENERAL_INQUIRY,
            required: true,
            index: true,
        },

        message: {
            type: String,
            required: true,
            trim: true,
            minlength: 10,
            maxlength: 5000,
        },

        status: {
            type: String,
            enum: Object.values(ContactSupportStatus),
            default: ContactSupportStatus.NEW,
            required: true,
            index: true,
        },

        assignedTo: {
            type: Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        repliedAt: {
            type: Date,
            default: null,
        },

        resolvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

contactSupportSchema.index({
    status: 1,
    createdAt: -1,
});

contactSupportSchema.index({
    category: 1,
    createdAt: -1,
});

export const ContactSupport = model("ContactSupport", contactSupportSchema);