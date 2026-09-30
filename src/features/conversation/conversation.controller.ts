import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import { Conversation } from "./conversation.model.js";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { ConversationStatus, statusText, UserRole } from "../../utils/enums.utils.js";

// ==========================================
// 1. CREATE OR GET CONVERSATION
// ==========================================
export const createOrGetConversation = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { client, freelancer, job, contract } = req.body;

        if (!client || !freelancer) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Client ID and Freelancer ID are required fields",
                    statusText: statusText.FAIL,
                })
            );
        }

        const clientObjId = new Types.ObjectId(String(client));
        const freelancerObjId = new Types.ObjectId(String(freelancer));
        const jobObjId = job ? new Types.ObjectId(String(job)) : null;

        // 1. Try finding conversation between these two users matching this job
        let conversation: any = null;

        if (jobObjId) {
            conversation = await Conversation.findOne({
                $or: [
                    { client: clientObjId, freelancer: freelancerObjId },
                    { client: freelancerObjId, freelancer: clientObjId },
                ],
                job: jobObjId,
            });
        }

        // 2. If not found by job, check if any conversation exists between these two users
        if (!conversation) {
            const fallbackConv = await Conversation.findOne({
                $or: [
                    { client: clientObjId, freelancer: freelancerObjId },
                    { client: freelancerObjId, freelancer: clientObjId },
                ],
            });

            if (fallbackConv) {
                // If existing conversation has no job and we now have a job, attach it
                if (!fallbackConv.job && jobObjId) {
                    fallbackConv.job = jobObjId;
                    if (contract) fallbackConv.contract = new Types.ObjectId(String(contract));
                    await fallbackConv.save();
                }
                conversation = fallbackConv;
            }
        }

        // 3. If still no conversation between these two users, create a new one
        if (!conversation) {
            try {
                conversation = await Conversation.create({
                    client: clientObjId,
                    freelancer: freelancerObjId,
                    job: jobObjId,
                    contract: contract ? new Types.ObjectId(String(contract)) : null,
                });
            } catch (err: any) {
                conversation = await Conversation.findOne({
                    $or: [
                        { client: clientObjId, freelancer: freelancerObjId },
                        { client: freelancerObjId, freelancer: clientObjId },
                    ],
                });
            }
        }

        if (conversation) {
            conversation = await Conversation.findById(conversation._id)
                .populate("client", "firstName lastName avatar email")
                .populate("freelancer", "firstName lastName avatar email")
                .populate("job", "title budget status hourlyRateFrom hourlyRateTo")
                .populate("contract")
                .populate("lastMessage");
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Conversation retrieved or created successfully",
            data: { conversation },
        });
    }
);

// ==========================================
// 2. GET USER CONVERSATIONS (With Pagination & Server-Side Deduplication)
// ==========================================
export const getUserConversations = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { userId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const userObjectId = new Types.ObjectId(String(userId));

        const filter = {
            $or: [{ client: userObjectId }, { freelancer: userObjectId }],
            status: { $ne: ConversationStatus.BLOCKED },
        };

        const skip = (page - 1) * limit;

        const [rawConversations, totalItems] = await Promise.all([
            Conversation.find(filter)
                .sort({ lastMessageAt: -1, updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("client", "firstName lastName avatar email")
                .populate("freelancer", "firstName lastName avatar email")
                .populate("job", "title budget status hourlyRateFrom hourlyRateTo")
                .populate("contract")
                .populate("lastMessage"),
            Conversation.countDocuments(filter),
        ]);

        // Deduplicate conversations for the same client-freelancer-job tuple
        const conversations: any[] = [];
        const seenPairs = new Set<string>();

        for (const conv of rawConversations) {
            const clientUid = conv.client?._id?.toString() || conv.client?.toString() || "";
            const freelancerUid = conv.freelancer?._id?.toString() || conv.freelancer?.toString() || "";
            const jobUid = conv.job?._id?.toString() || conv.job?.toString() || "";

            const pairKey = [clientUid, freelancerUid].sort().join("-") + `-${jobUid}`;

            if (!seenPairs.has(pairKey)) {
                seenPairs.add(pairKey);
                conversations.push(conv);
            }
        }

        const totalPages = Math.ceil(totalItems / limit) || 1;

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "User conversations returned successfully",
            data: {
                conversations,
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
// 3. GET SINGLE CONVERSATION BY ID
// ==========================================
export const getConversationById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const conversation = await Conversation.findById(id)
            .populate("client", "firstName lastName avatar email")
            .populate("freelancer", "firstName lastName avatar email")
            .populate("job", "title budget status hourlyRateFrom hourlyRateTo")
            .populate("contract")
            .populate("lastMessage");

        if (!conversation) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Conversation not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Conversation returned successfully",
            data: { conversation },
        });
    }
);

// ==========================================
// 4. UPDATE USER SETTINGS (Pinned, Muted, Archived)
// ==========================================
export const updateUserSettings = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { role, pinned, muted, archived } = req.body;

        if (!role || !["client", "freelancer"].includes(role)) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Role must be either 'client' or 'freelancer'",
                    statusText: statusText.FAIL,
                })
            );
        }

        const updateFields: Record<string, boolean> = {};

        if (typeof pinned === "boolean") updateFields[`${role}Pinned`] = pinned;
        if (typeof muted === "boolean") updateFields[`${role}Muted`] = muted;
        if (typeof archived === "boolean") updateFields[`${role}Archived`] = archived;

        const conversation = await Conversation.findByIdAndUpdate(
            id,
            { $set: updateFields },
            { new: true, runValidators: true }
        );

        if (!conversation) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Conversation not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Conversation settings updated successfully",
            data: { conversation },
        });
    }
);

// ==========================================
// 5. RESET UNREAD COUNT
// ==========================================
export const resetUnreadCount = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { role } = req.body;

        if (!role || ![UserRole.CLIENT, UserRole.FREELANCER].includes(role)) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Role must be either 'client' or 'freelancer'",
                    statusText: statusText.FAIL,
                })
            );
        }

        const fieldToReset = role === "client" ? "clientUnreadCount" : "freelancerUnreadCount";

        const conversation = await Conversation.findByIdAndUpdate(
            id,
            { $set: { [fieldToReset]: 0 } },
            { new: true }
        );

        if (!conversation) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Conversation not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Unread count reset successfully",
            data: { conversation },
        });
    }
);