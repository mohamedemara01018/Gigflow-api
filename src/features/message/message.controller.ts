import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import mongoose, { Types } from "mongoose";
import Message from "./message.model.js";

import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import {
    AttachmentEntityType,
    MessageStatus,
    MessageType,
    statusText,
    cloudinaryFolderPath,
} from "../../utils/enums.utils.js";
import { Conversation } from "../conversation/conversation.model.js";
import { ICloudinaryProbs, uploadImageToCloudinary } from "../../utils/cloudinary.utils.js";
import { Attachment } from "../attachment/attachment.model.js";
import { deleteAttachmentsByEntity } from "../../utils/functions.js";
import { getIO } from "../../socket.js";

// ==========================================
// 1. GET MESSAGES FOR A CONVERSATION
// ==========================================
export const getConversationMessages = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { conversationId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Conversation not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const skip = (page - 1) * limit;

        const [messages, totalItems] = await Promise.all([
            Message.find({ conversation: conversationId, isDeleted: false })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("sender", "firstName lastName avatar email")
                .populate("attachments")
                .populate({
                    path: "replyTo",
                    select: "content sender type isDeleted",
                    populate: {
                        path: "sender",
                        select: "firstName lastName",
                    },
                }),
            Message.countDocuments({ conversation: conversationId, isDeleted: false }),
        ]);

        const totalPages = Math.ceil(totalItems / limit) || 1;

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Messages retrieved successfully",
            data: {
                messages,
                pagination: {
                    page,
                    limit,
                    totalItems,
                    totalPages,
                },
            },
        });
    }
);

// ==========================================
// 2. SEND MESSAGE (With File Attachments)
// ==========================================
export const sendMessage = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { conversationId, senderId, content, replyTo, type } = req.body;

        if (!conversationId || !senderId) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Conversation ID and Sender ID are required fields",
                    statusText: statusText.FAIL,
                })
            );
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Conversation not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        let fileList: Express.Multer.File[] = [];
        if (Array.isArray(req.files)) {
            fileList = req.files;
        } else if (req.files && typeof req.files === "object") {
            fileList = Object.values(req.files).flat();
        } else if (req.file) {
            fileList = [req.file];
        }

        const messageContent = content ? content.trim() : null;
        const messageType =
            type || (fileList.length > 0 ? MessageType.FILE : MessageType.TEXT);

        if (!messageContent && fileList.length === 0) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Message content or file attachment is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        const messageId = new Types.ObjectId();
        let createdAttachmentIds: Types.ObjectId[] = [];

        if (fileList.length > 0) {
            const uploadPromises = fileList.map((file) => {
                const isPdf = file.mimetype.includes("pdf");
                const fileName = isPdf
                    ? `pdf-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`
                    : `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

                const targetFolder = isPdf
                    ? cloudinaryFolderPath.PDF
                    : cloudinaryFolderPath.IMAGE;

                return uploadImageToCloudinary(
                    file.buffer,
                    targetFolder,
                    fileName,
                    isPdf ? "raw" : "image"
                ) as Promise<ICloudinaryProbs>;
            });

            const uploadResults = await Promise.all(uploadPromises);

            const attachmentsToCreate = uploadResults.map((result, index) => ({
                url: result.secure_url,
                publicId: result.public_id,
                originalName: fileList[index].originalname,
                mimeType: fileList[index].mimetype,
                fileName: result.display_name || fileList[index].originalname,
                size: fileList[index].size,
                entityId: messageId,
                entityType: AttachmentEntityType.MESSAGE,
                uploadedBy: senderId,
            }));

            const createdAttachments = await Attachment.insertMany(attachmentsToCreate);
            createdAttachmentIds = createdAttachments.map((att) => att._id);
        }

        const newMessage = await Message.create({
            _id: messageId,
            conversation: new Types.ObjectId(conversationId),
            sender: new Types.ObjectId(senderId),
            content: messageContent,
            type: messageType,
            attachments: createdAttachmentIds,
            replyTo: replyTo ? new Types.ObjectId(replyTo) : null,
            status: MessageStatus.SENT,
        });

        const isClient = conversation.client.toString() === senderId;
        const unreadField = isClient ? "freelancerUnreadCount" : "clientUnreadCount";

        await Conversation.findByIdAndUpdate(conversationId, {
            $set: { lastMessage: newMessage._id, lastMessageAt: newMessage.createdAt }, $inc: { [unreadField]: 1 },
        });

        const populatedMessage = await newMessage.populate([
            { path: "sender", select: "firstName lastName avatar email" },
            { path: "attachments" },
            {
                path: "replyTo",
                select: "content sender type",
                populate: { path: "sender", select: "firstName lastName" },
            },
        ]);

        // SOCKET EMISSION FROM BACKEND
        getIO()
            .to(`conversation:${conversationId}`)
            .emit("message:received", populatedMessage);

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: "Message sent successfully",
            data: {
                message: populatedMessage,
            },
        });
    }
);

// ==========================================
// 3. EDIT MESSAGE
// ==========================================
export const editMessage = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { content, senderId } = req.body;

        if (!content || !content.trim()) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Updated content cannot be empty",
                    statusText: statusText.FAIL,
                })
            );
        }

        const message = await Message.findById(id);

        if (!message || message.isDeleted) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Message not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (senderId && message.sender.toString() !== senderId) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You can only edit your own messages",
                    statusText: statusText.FAIL,
                })
            );
        }

        message.content = content.trim();
        message.editedAt = new Date();
        await message.save();

        const populatedMessage = await message.populate([
            { path: "sender", select: "firstName lastName avatar email" },
            { path: "attachments" },
            {
                path: "replyTo",
                select: "content sender type",
                populate: { path: "sender", select: "firstName lastName" },
            },
        ]);

        // SOCKET EMISSION FROM BACKEND
        getIO()
            .to(`conversation:${message.conversation}`)
            .emit("message:updated", populatedMessage);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Message updated successfully",
            data: { message: populatedMessage },
        });
    }
);

// ==========================================
// 4. SOFT DELETE MESSAGE
// ==========================================
export const deleteMessage = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { senderId } = req.body;

        const message = await Message.findById(id);

        if (!message || message.isDeleted) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Message not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (senderId && message.sender.toString() !== senderId) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You can only delete your own messages",
                    statusText: statusText.FAIL,
                })
            );
        }

        await deleteAttachmentsByEntity(AttachmentEntityType.MESSAGE, String(id));

        message.isDeleted = true;
        message.deletedAt = new Date();
        message.content = "This message was deleted";
        message.attachments = [];
        await message.save();

        // SOCKET EMISSION FROM BACKEND
        getIO().to(`conversation:${message.conversation}`).emit("message:deleted", {
            messageId: id,
            conversationId: message.conversation,
        });

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Message deleted successfully",
            data: null,
        });
    }
);

// ==========================================
// 5. UPDATE MESSAGE STATUS (Delivered / Read)
// ==========================================
export const updateMessageStatus = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !Object.values(MessageStatus).includes(status)) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Invalid or missing message status",
                    statusText: statusText.FAIL,
                })
            );
        }

        const updateData: Record<string, any> = { status };

        if (status === MessageStatus.DELIVERED) {
            updateData.deliveredAt = new Date();
        } else if (status === MessageStatus.READ) {
            updateData.readAt = new Date();
            if (!updateData.deliveredAt) updateData.deliveredAt = new Date();
        }

        const message = await Message.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        ).populate([
            { path: "sender", select: "firstName lastName avatar email" },
            { path: "attachments" },
        ]);

        if (!message) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Message not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // SOCKET EMISSION FROM BACKEND
        getIO()
            .to(`conversation:${message.conversation}`)
            .emit("message:status_updated", message);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Message status updated successfully",
            data: { message },
        });
    }
);