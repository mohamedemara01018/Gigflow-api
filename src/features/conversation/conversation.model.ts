import { Schema, model, Types } from "mongoose";
import { ConversationStatus } from "../../utils/enums.utils.js";



const conversationSchema = new Schema(
    {
        /**
         * Client participating in the conversation.
         */
        client: {
            type: Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        /**
         * Freelancer participating in the conversation.
         */
        freelancer: {
            type: Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        /**
         * Job related to this conversation.
         */
        job: {
            type: Types.ObjectId,
            ref: "Job",
            default: null,
            index: true,
        },

        /**
         * Contract related to this conversation.
         * Null before a contract is created.
         */
        contract: {
            type: Types.ObjectId,
            ref: "Contract",
            default: null,
            index: true,
        },

        /**
         * Latest message in the conversation.
         * Useful for displaying conversation previews.
         */
        lastMessage: {
            type: Types.ObjectId,
            ref: "Message",
            default: null,
        },

        lastMessageAt: {
            type: Date,
            default: null,
            index: true,
        },

        status: {
            type: String,
            enum: Object.values(ConversationStatus),
            default: ConversationStatus.ACTIVE,
            index: true,
        },

        /**
         * Number of unread messages for each participant.
         */
        clientUnreadCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        freelancerUnreadCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        /**
         * Whether the conversation is pinned by each participant.
         */
        clientPinned: {
            type: Boolean,
            default: false,
        },

        freelancerPinned: {
            type: Boolean,
            default: false,
        },

        /**
         * Whether notifications are muted by each participant.
         */
        clientMuted: {
            type: Boolean,
            default: false,
        },

        freelancerMuted: {
            type: Boolean,
            default: false,
        },

        /**
         * Archived independently by each participant.
         */
        clientArchived: {
            type: Boolean,
            default: false,
        },

        freelancerArchived: {
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
 * Prevent duplicate conversations for the same
 * client, freelancer, and job.
 */
conversationSchema.index(
    {
        client: 1,
        freelancer: 1,
        job: 1,
    },
    {
        unique: true,
    }
);

/**
 * Get a user's conversations.
 */
conversationSchema.index({
    client: 1,
    lastMessageAt: -1,
});

conversationSchema.index({
    freelancer: 1,
    lastMessageAt: -1,
});

/**
 * Find conversations related to a job.
 */
conversationSchema.index({
    job: 1,
});

/**
 * Find conversations related to a contract.
 */
conversationSchema.index({
    contract: 1,
});

export const Conversation = model("Conversation", conversationSchema);