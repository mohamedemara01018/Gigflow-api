import { Router } from "express";
import {
    getMyNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
} from "./notification.controller.js";
import { authenticationMiddleware } from "../../middleware/authentication.middleware.js";

const router = Router();



router.route("/")
    .get(authenticationMiddleware, getMyNotifications)
    .delete(authenticationMiddleware, clearAllNotifications);

router.get("/unread-count", authenticationMiddleware, getUnreadCount);
router.patch("/read-all", authenticationMiddleware, markAllAsRead);

router.route("/:id")
    .patch(authenticationMiddleware, markAsRead)
    .delete(authenticationMiddleware, deleteNotification);

export default router;