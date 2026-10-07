import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import { Conversation } from "./conversation.model.js";
import { Proposal } from "../proposal/proposal.model.js";
import { Job } from "../job/job.model.js";
import { Contract } from "../contract/contract.model.js";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { ContractStatus, ConversationStatus, statusText, UserRole } from "../../utils/enums.utils.js";

// ==========================================
// 1. CREATE OR GET CONVERSATION
// ==========================================
export const createOrGetConversation = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const {
            proposal: proposalParam,
            proposalId: proposalIdParam,
            client: clientParam,
            freelancer: freelancerParam,
            job: jobParam,
            contract: contractParam,
        } = req.body;

        const currentUserId = req.currentUser?._id;
        const currentUserRole = req.currentUser?.role;

        const targetProposalId = proposalParam || proposalIdParam;

        let conversation: any = null;

        // ----------------------------------------------------
        // Path A: Creating/Getting Conversation from a Proposal
        // ----------------------------------------------------
        if (targetProposalId) {
            const proposalDoc = await Proposal.findById(targetProposalId).populate("job");
            if (!proposalDoc) {
                return next(
                    appError({
                        statusCode: StatusCodes.NOT_FOUND,
                        message: "Proposal not found",
                        statusText: statusText.FAIL,
                    })
                );
            }

            const jobDoc = proposalDoc.job as any;
            if (!jobDoc) {
                return next(
                    appError({
                        statusCode: StatusCodes.NOT_FOUND,
                        message: "Job associated with proposal not found",
                        statusText: statusText.FAIL,
                    })
                );
            }

            const clientObjId = jobDoc.client?._id ? jobDoc.client._id : jobDoc.client;
            const freelancerObjId = proposalDoc.freelancer?._id ? proposalDoc.freelancer._id : proposalDoc.freelancer;

            // If user is authenticated as Client, ensure ownership of the job
            if (currentUserRole === UserRole.CLIENT && currentUserId) {
                if (clientObjId.toString() !== currentUserId.toString()) {
                    return next(
                        appError({
                            statusCode: StatusCodes.FORBIDDEN,
                            message: "You are not authorized to start a conversation for this proposal",
                            statusText: statusText.FAIL,
                        })
                    );
                }
            }

            // 1. Search for existing Conversation matching (client, freelancer, proposal)
            conversation = await Conversation.findOne({
                client: clientObjId,
                freelancer: freelancerObjId,
                proposal: proposalDoc._id,
            });

            // If it existed but was soft-deleted, restore it
            if (conversation) {
                let needsSave = false;
                if (conversation.freelancerDeletedAt) {
                    conversation.freelancerDeletedAt = null;
                    needsSave = true;
                }
                if (conversation.clientDeletedAt) {
                    conversation.clientDeletedAt = null;
                    needsSave = true;
                }
                if (!conversation.contract) {
                    const existingContract = await Contract.findOne({ proposal: proposalDoc._id });
                    if (existingContract) {
                        conversation.contract = existingContract._id;
                        needsSave = true;
                    }
                }
                if (needsSave) {
                    await conversation.save();
                }
            } else {
                // 2. Create new Conversation for this specific proposal
                const existingContract = await Contract.findOne({ proposal: proposalDoc._id });

                try {
                    conversation = await Conversation.create({
                        client: clientObjId,
                        freelancer: freelancerObjId,
                        job: jobDoc._id,
                        proposal: proposalDoc._id,
                        contract: existingContract ? existingContract._id : null,
                    });
                } catch (err: any) {
                    // Fallback in case of race condition
                    conversation = await Conversation.findOne({
                        client: clientObjId,
                        freelancer: freelancerObjId,
                        proposal: proposalDoc._id,
                    });
                }
            }
        } else {
            // ----------------------------------------------------
            // Path B: Direct / Legacy Conversation Creation
            // ----------------------------------------------------
            const clientVal = clientParam || (currentUserRole === UserRole.CLIENT ? currentUserId : null);
            const freelancerVal = freelancerParam || (currentUserRole === UserRole.FREELANCER ? currentUserId : null);

            if (!clientVal || !freelancerVal) {
                return next(
                    appError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        message: "Proposal ID or (Client ID and Freelancer ID) are required",
                        statusText: statusText.FAIL,
                    })
                );
            }

            const clientObjId = new Types.ObjectId(String(clientVal));
            const freelancerObjId = new Types.ObjectId(String(freelancerVal));
            const jobObjId = jobParam ? new Types.ObjectId(String(jobParam)) : null;

            if (jobObjId) {
                conversation = await Conversation.findOne({
                    $or: [
                        { client: clientObjId, freelancer: freelancerObjId },
                        { client: freelancerObjId, freelancer: clientObjId },
                    ],
                    job: jobObjId,
                    proposal: null,
                });
            }

            if (!conversation) {
                conversation = await Conversation.findOne({
                    $or: [
                        { client: clientObjId, freelancer: freelancerObjId },
                        { client: freelancerObjId, freelancer: clientObjId },
                    ],
                    proposal: null,
                });
            }

            if (!conversation) {
                try {
                    conversation = await Conversation.create({
                        client: clientObjId,
                        freelancer: freelancerObjId,
                        job: jobObjId,
                        contract: contractParam ? new Types.ObjectId(String(contractParam)) : null,
                    });
                } catch (err: any) {
                    conversation = await Conversation.findOne({
                        $or: [
                            { client: clientObjId, freelancer: freelancerObjId },
                            { client: freelancerObjId, freelancer: clientObjId },
                        ],
                        proposal: null,
                    });
                }
            }
        }

        if (conversation) {
            conversation = await Conversation.findById(conversation._id)
                .populate("client", "firstName lastName avatar email")
                .populate("freelancer", "firstName lastName avatar email")
                .populate("job", "title budget status hourlyRateFrom hourlyRateTo")
                .populate("proposal")
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
// 2. GET USER CONVERSATIONS (With Pagination & Soft-Delete Filtering)
// ==========================================
export const getUserConversations = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { userId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;

        const userObjectId = new Types.ObjectId(String(userId));

        // Filter out soft-deleted conversations per participant
        const filter: any = {
            $or: [
                { client: userObjectId, clientDeletedAt: null },
                { freelancer: userObjectId, freelancerDeletedAt: null },
            ],
            status: { $ne: ConversationStatus.BLOCKED },
        };

        const skip = (page - 1) * limit;

        const [conversations, totalItems] = await Promise.all([
            Conversation.find(filter)
                .sort({ lastMessageAt: -1, updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("client", "firstName lastName avatar email")
                .populate("freelancer", "firstName lastName avatar email")
                .populate("job", "title budget status hourlyRateFrom hourlyRateTo")
                .populate("proposal")
                .populate("contract")
                .populate("lastMessage"),
            Conversation.countDocuments(filter),
        ]);

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
            .populate("proposal")
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
// 4. DELETE CONVERSATION (Freelancer Only After Contract Completion, or Client)
// ==========================================
export const deleteConversation = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const currentUserId = req.currentUser?._id;
        const currentUserRole = req.currentUser?.role;

        const conversation = await Conversation.findById(id).populate("contract");
        if (!conversation) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Conversation not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const isFreelancer =
            conversation.freelancer?.toString() === currentUserId?.toString() ||
            currentUserRole === UserRole.FREELANCER;

        const isClient =
            conversation.client?.toString() === currentUserId?.toString() ||
            currentUserRole === UserRole.CLIENT;

        if (!isFreelancer && !isClient) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You are not a participant in this conversation",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Freelancer Rule: Can ONLY delete conversation after contract is completed!
        if (isFreelancer) {
            const contract = conversation.contract as any;
            if (!contract || (contract.status !== ContractStatus.COMPLETED && (contract.status as string) !== "completed")) {
                return next(
                    appError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        message: "Freelancer can only delete a conversation after the associated contract is completed.",
                        statusText: statusText.FAIL,
                    })
                );
            }

            conversation.freelancerDeletedAt = new Date();
            await conversation.save();
        } else if (isClient) {
            conversation.clientDeletedAt = new Date();
            await conversation.save();
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Conversation deleted successfully from your inbox",
            data: null,
        });
    }
);

// ==========================================
// 5. UPDATE USER SETTINGS (Pinned, Muted, Archived)
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
// 6. RESET UNREAD COUNT
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