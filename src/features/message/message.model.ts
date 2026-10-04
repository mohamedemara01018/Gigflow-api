import { Schema, model, Types } from "mongoose";
import { MessageStatus, MessageType } from "../../utils/enums.utils.js";


const messageSchema = new Schema(
    {
        conversation: {
            type: Types.ObjectId,
            ref: "Conversation",
            required: true,
            index: true,
        },

        sender: {
            type: Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: Object.values(MessageType),
            default: MessageType.TEXT,
        },

        content: {
            type: String,
            trim: true,
            maxlength: 5000,
            default: null,
        },

        /**
         * Attachments belonging to this message.
         */
        attachments: [
            {
                type: Types.ObjectId,
                ref: "Attachment",
            },
        ],

        /**
         * Message this message is replying to.
         */
        replyTo: {
            type: Types.ObjectId,
            ref: "Message",
            default: null,
        },

        status: {
            type: String,
            enum: Object.values(MessageStatus),
            default: MessageStatus.SENT,
            index: true,
        },

        deliveredAt: {
            type: Date,
            default: null,
        },

        readAt: {
            type: Date,
            default: null,
        },

        editedAt: {
            type: Date,
            default: null,
        },

        deletedAt: {
            type: Date,
            default: null,
        },

        isDeleted: {
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
 * Get messages in a conversation chronologically.
 */
messageSchema.index({
    conversation: 1,
    createdAt: 1,
});

/**
 * Get the latest messages quickly.
 */
messageSchema.index({
    conversation: 1,
    createdAt: -1,
});

/**
 * Get messages sent by a specific user.
 */
messageSchema.index({
    sender: 1,
    createdAt: -1,
});

export default model("Message", messageSchema);