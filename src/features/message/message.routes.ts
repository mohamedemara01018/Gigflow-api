import { Router } from "express";
import {
    getConversationMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    updateMessageStatus,
} from "./message.controller.js";
import { upload } from "../../middleware/multer.middleware.js";

const router = Router();

// 1. Send a new message (Upload up to 5 files under field name "files")
router.post("/", upload.array("attachments", 5), sendMessage);

// 2. Get all messages for a specific conversation
router.get("/conversation/:conversationId", getConversationMessages);

// 3. Edit an existing message
router.patch("/:id", editMessage);

// 4. Update message status (e.g., DELIVERED, READ)
router.patch("/:id/status", updateMessageStatus);

// 5. Delete (soft-delete) a message
router.delete("/:id", deleteMessage);

export default router;