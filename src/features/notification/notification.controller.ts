import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { appError } from "../../utils/appError.utils.js";
import { statusText } from "../../utils/enums.utils.js";
import { Notification } from "./notification.model.js";

// ==========================================
// 1. GET ALL NOTIFICATIONS (Paginated & Filtered)
// ==========================================
export const getMyNotifications = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const userId = req.currentUser?._id
        if (!userId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const { page = 1, limit = 10, isRead } = req.query;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));
        const skip = (pageNum - 1) * limitNum;

        const filter: Record<string, any> = { recipient: userId };

        if (isRead !== undefined) {
            filter.isRead = isRead === "true";
        }

        const [notifications, totalNotifications, unreadCount] = await Promise.all([
            Notification.find(filter)
                .populate("sender", "firstName lastName avatar role")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Notification.countDocuments(filter),
            Notification.countDocuments({ recipient: userId, isRead: false }),
        ]);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Notifications fetched successfully",
            data: {
                totalNotifications,
                unreadCount,
                currentPage: pageNum,
                totalPages: Math.ceil(totalNotifications / limitNum) || 1,
                notifications,
            },
        });
    }
);

// ==========================================
// 2. GET UNREAD NOTIFICATIONS COUNT
// ==========================================
export const getUnreadCount = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const userId = req.currentUser?._id;
        if (!userId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const unreadCount = await Notification.countDocuments({ recipient: userId, isRead: false });

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Unread notifications count fetched successfully",
            data: {
                unreadCount,
            },
        });
    }
);

// ==========================================
// 3. MARK SINGLE NOTIFICATION AS READ
// ==========================================
export const markAsRead = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const userId = req.currentUser?._id;
        if (!userId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const { id } = req.params;

        if (!Types.ObjectId.isValid(String(id))) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Invalid notification ID",
                    statusText: statusText.FAIL,
                })
            );
        }

        const notification = await Notification.findOneAndUpdate(
            { _id: id, recipient: userId },
            { $set: { isRead: true, readAt: new Date() } },
            { new: true }
        );

        if (!notification) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Notification not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Notification marked as read",
            data: {
                notification,
            },
        });
    }
);

// ==========================================
// 4. MARK ALL NOTIFICATIONS AS READ
// ==========================================
export const markAllAsRead = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const userId = req.currentUser?._id;
        if (!userId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const result = await Notification.updateMany(
            { recipient: userId, isRead: false },
            { $set: { isRead: true, readAt: new Date() } }
        );

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "All notifications marked as read",
            data: {
                modifiedCount: result.modifiedCount,
            },
        });
    }
);

// ==========================================
// 5. DELETE SINGLE NOTIFICATION
// ==========================================
export const deleteNotification = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const userId = req.currentUser?._id;
        if (!userId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const { id } = req.params;

        if (!Types.ObjectId.isValid(String(id))) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Invalid notification ID",
                    statusText: statusText.FAIL,
                })
            );
        }

        const deletedNotification = await Notification.findOneAndDelete({ _id: id, recipient: userId });

        if (!deletedNotification) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Notification not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Notification deleted successfully",
            data: null,
        });
    }
);

// ==========================================
// 6. CLEAR ALL NOTIFICATIONS FOR USER
// ==========================================
export const clearAllNotifications = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const userId = req.currentUser?._id;
        if (!userId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        await Notification.deleteMany({ recipient: userId });

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "All notifications cleared successfully",
            data: null,
        });
    }
);