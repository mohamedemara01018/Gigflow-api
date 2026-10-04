import { Schema, model, Types } from "mongoose";
import { NotificationEntityType, NotificationType } from "../../utils/enums.utils.js";



const notificationSchema = new Schema(
    {
        /**
         * User who receives the notification.
         */
        recipient: {
            type: Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        /**
         * User who triggered the notification.
         * Null for system notifications.
         */
        sender: {
            type: Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        type: {
            type: String,
            enum: Object.values(NotificationType),
            required: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },

        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },

        /**
         * Entity related to the notification.
         * Example:
         * proposal_received -> Proposal ID
         * payment_received  -> Payment ID
         * message_received  -> Message ID
         */
        entityType: {
            type: String,
            enum: Object.values(NotificationEntityType),
            default: null,
        },

        entityId: {
            type: Types.ObjectId,
            default: null,
            index: true,
        },

        /**
         * Optional frontend route.
         * Example:
         * /dashboard/proposals/123
         */
        link: {
            type: String,
            default: null,
        },

        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },

        readAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

/**
 * Get unread notifications for a user.
 */
notificationSchema.index({
    recipient: 1,
    isRead: 1,
    createdAt: -1,
});

/**
 * Get all notifications for a user.
 */
notificationSchema.index({
    recipient: 1,
    createdAt: -1,
});

/**
 * Find notifications related to a specific entity.
 */
notificationSchema.index({
    entityType: 1,
    entityId: 1,
});

export const Notification = model("Notification", notificationSchema);