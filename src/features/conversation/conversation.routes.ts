import { Router } from "express";
import {
    createOrGetConversation,
    getUserConversations,
    getConversationById,
    updateUserSettings,
    resetUnreadCount,
    deleteConversation,
} from "./conversation.controller.js";
import { authenticationMiddleware } from "../../middleware/authentication.middleware.js";

const router = Router();

// ==========================================
// CONVERSATION ROUTES
// ==========================================

// 1. Create or retrieve an existing conversation (supports proposal-based conversations)
router.post("/", authenticationMiddleware, createOrGetConversation);

// 2. Get paginated conversations for a specific user
router.get("/user/:userId", authenticationMiddleware, getUserConversations);

// 3. Get single conversation by ID
router.get("/:id", authenticationMiddleware, getConversationById);

// 4. Update participant settings (pinned, muted, archived)
router.patch("/:id/settings", authenticationMiddleware, updateUserSettings);

// 5. Reset unread message count
router.patch("/:id/read", authenticationMiddleware, resetUnreadCount);

// 6. Delete conversation (Freelancer can delete only after associated contract is COMPLETED)
router.delete("/:id", authenticationMiddleware, deleteConversation);
router.patch("/:id/delete", authenticationMiddleware, deleteConversation);

export default router;