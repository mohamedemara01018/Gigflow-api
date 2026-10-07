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
         * Proposal related to this conversation.
         */
        proposal: {
            type: Types.ObjectId,
            ref: "Proposal",
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
         * Soft deletion markers per participant.
         */
        freelancerDeletedAt: {
            type: Date,
            default: null,
            index: true,
        },

        clientDeletedAt: {
            type: Date,
            default: null,
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
 * Unique conversation per (client, freelancer, proposal) tuple.
 * Allows multiple proposals between the same client & freelancer to have distinct conversations.
 */
conversationSchema.index(
    {
        client: 1,
        freelancer: 1,
        proposal: 1,
    },
    {
        unique: true,
        sparse: true,
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
 * Find conversations related to a proposal.
 */
conversationSchema.index({
    proposal: 1,
});

/**
 * Find conversations related to a contract.
 */
conversationSchema.index({
    contract: 1,
});

export const Conversation = model("Conversation", conversationSchema);

// Drop obsolete legacy index if present
Conversation.collection.dropIndex("client_1_freelancer_1_job_1").catch(() => {
    // Silently ignore if index does not exist
});