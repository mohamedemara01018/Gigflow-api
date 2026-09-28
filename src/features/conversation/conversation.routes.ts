import { Router } from "express";
import {
    createOrGetConversation,
    getUserConversations,
    getConversationById,
    updateUserSettings,
    resetUnreadCount,
} from "./conversation.controller.js";

const router = Router();

// ==========================================
// CONVERSATION ROUTES
// ==========================================

// 1. Create or retrieve an existing conversation
router.post("/", createOrGetConversation);

// 2. Get paginated conversations for a specific user
router.get("/user/:userId", getUserConversations);

// 3. Get single conversation by ID
router.get("/:id", getConversationById);

// 4. Update participant settings (pinned, muted, archived)
router.patch("/:id/settings", updateUserSettings);

// 5. Reset unread message count
router.patch("/:id/read", resetUnreadCount);

export default router;