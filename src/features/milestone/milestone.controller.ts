import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { ContractStatus, MilestoneStatus, statusText, UserRole } from "../../utils/enums.utils.js";
import { Milestone } from "./milestone.model.js";
import { Contract } from "../contract/contract.model.js";
import { Conversation } from "../conversation/conversation.model.js";
import { getIO } from "../../socket.js";
import {
    notifyFreelancerOnMilestoneCreated,
    notifyClientOnMilestoneSubmitted,
    notifyFreelancerOnMilestoneApproved,
    notifyFreelancerOnMilestoneRejected,
} from "../contract/contract.notification.js";

// ==========================================
// 1. GET ALL MILESTONES FOR A CONTRACT
// ==========================================
export const getContractMilestones = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { contractId } = req.params;

        const contract = await Contract.findById(contractId);
        if (!contract) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Contract not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const milestones = await Milestone.find({ contract: contractId }).sort({ order: 1 });

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Milestones fetched successfully",
            data: {
                milestones,
            },
        });
    }
);

// ==========================================
// 2. GET SINGLE MILESTONE BY ID
// ==========================================
export const getMilestoneById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const milestone = await Milestone.findById(id).populate("contract", "title status client freelancer totalAmount");

        if (!milestone) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Milestone not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Milestone details fetched successfully",
            data: {
                milestone,
            },
        });
    }
);

// ==========================================
// 3. CREATE A SINGLE MILESTONE (Client Creates Milestone)
// ==========================================
export const createMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id;
        const currentUserRole = req.currentUser?.role;

        if (!currentUserId || currentUserRole !== UserRole.CLIENT) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "Only the client can create milestones",
                    statusText: statusText.FAIL,
                })
            );
        }

        const {
            contract: contractParam,
            contractId: contractIdParam,
            title,
            description,
            amount: rawAmount,
            dueDate,
        } = req.body;

        const targetContractId = contractParam || contractIdParam;
        const amount = Number(rawAmount);

        // Validation
        if (!targetContractId || !title || !title.trim() || isNaN(amount) || amount <= 0) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "contract, title, and a valid amount greater than 0 are required",
                    statusText: statusText.FAIL,
                })
            );
        }

        const contract = await Contract.findById(targetContractId);
        if (!contract) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Associated contract not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Verify user is Client of the Contract
        if (contract.client.toString() !== currentUserId.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You are not authorized to add milestones to this contract",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Verify Contract is still editable (DRAFT status)
        if (contract.status !== ContractStatus.DRAFT) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Milestones can only be created while the contract is in draft status",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Calculate existing milestone budget allocation
        const existingMilestones = await Milestone.find({ contract: targetContractId });
        const currentAllocated = existingMilestones.reduce((sum, m) => sum + (m.amount || 0), 0);
        const remainingBudget = Math.max(0, Math.round((contract.totalAmount - currentAllocated) * 100) / 100);

        if (Math.round(amount * 100) > Math.round(remainingBudget * 100)) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: `Milestone amount ($${amount}) exceeds the remaining contract budget ($${remainingBudget})`,
                    statusText: statusText.FAIL,
                })
            );
        }

        // Automatically determine milestone order (1, 2, 3...)
        const highestOrderMilestone = await Milestone.findOne({ contract: targetContractId }).sort({ order: -1 });
        const autoOrder = (highestOrderMilestone?.order || 0) + 1;

        const newMilestone = await Milestone.create({
            contract: targetContractId,
            title: title.trim(),
            description: description && description.trim() ? description.trim() : null,
            amount: Math.round(amount * 100) / 100,
            order: autoOrder,
            dueDate: dueDate ? new Date(dueDate) : null,
            status: MilestoneStatus.PENDING,
        });

        // Realtime Socket.IO emission to conversation room
        try {
            const conversation = await Conversation.findOne({ contract: targetContractId });
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("milestone:created", newMilestone);
            }
        } catch (socketError) {
            console.error("Failed to emit milestone:created event:", socketError);
        }

        // Notify freelancer
        await notifyFreelancerOnMilestoneCreated(newMilestone, contract);

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: "Milestone created successfully",
            data: {
                milestone: newMilestone,
            },
        });
    }
);

// ==========================================
// 4. SUBMIT MILESTONE (Freelancer submits work)
// ==========================================
export const submitMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const currentUserId = req.currentUser?._id;
        const { submissionNotes, submissionUrl } = req.body;

        const milestone = await Milestone.findById(id).populate("contract");

        if (!milestone) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Milestone not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const contract = milestone.contract as any;
        if (contract?.freelancer?.toString() !== currentUserId?.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "Only the assigned freelancer can submit work for this milestone",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (milestone.status !== MilestoneStatus.IN_PROGRESS && milestone.status !== MilestoneStatus.REJECTED) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: `Cannot submit a milestone with status '${milestone.status}'. Milestone must be IN_PROGRESS or REJECTED.`,
                    statusText: statusText.FAIL,
                })
            );
        }

        milestone.status = MilestoneStatus.SUBMITTED;
        milestone.submittedAt = new Date();
        milestone.submissionNotes = submissionNotes && submissionNotes.trim() ? submissionNotes.trim() : null;
        milestone.submissionUrl = submissionUrl && submissionUrl.trim() ? submissionUrl.trim() : null;
        await milestone.save();

        try {
            const conversation = await Conversation.findOne({ contract: contract._id });
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("milestone:updated", milestone);
            }
        } catch (socketError) {
            console.error("Socket emission failed:", socketError);
        }

        // Notify client
        await notifyClientOnMilestoneSubmitted(milestone, contract);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Milestone work submitted successfully for client review",
            data: {
                milestone,
            },
        });
    }
);

// ==========================================
// 5. APPROVE MILESTONE (Client approves)
// ==========================================
export const approveMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const currentUserId = req.currentUser?._id;

        const milestone = await Milestone.findById(id).populate("contract");

        if (!milestone) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Milestone not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const contract = milestone.contract as any;
        if (contract?.client?.toString() !== currentUserId?.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "Only the client can approve this milestone",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (milestone.status !== MilestoneStatus.SUBMITTED) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: `Cannot approve milestone in '${milestone.status}' status. Milestone must be SUBMITTED first.`,
                    statusText: statusText.FAIL,
                })
            );
        }

        const now = new Date();
        milestone.status = MilestoneStatus.APPROVED;
        milestone.approvedAt = now;
        milestone.completedAt = now;
        await milestone.save();

        // Automatically activate the next PENDING milestone (if any)
        const nextMilestone = await Milestone.findOne({
            contract: milestone.contract,
            order: { $gt: milestone.order },
            status: MilestoneStatus.PENDING,
        }).sort({ order: 1 });

        if (nextMilestone) {
            nextMilestone.status = MilestoneStatus.IN_PROGRESS;
            await nextMilestone.save();
        } else {
            // Check if all milestones are approved to auto-complete the Contract
            const remainingMilestones = await Milestone.countDocuments({
                contract: milestone.contract,
                status: { $ne: MilestoneStatus.APPROVED },
            });

            if (remainingMilestones === 0) {
                await Contract.findByIdAndUpdate(milestone.contract, {
                    status: ContractStatus.COMPLETED,
                    completedAt: now,
                });
            }
        }

        try {
            const conversation = await Conversation.findOne({ contract: contract._id });
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("milestone:updated", milestone);
                if (nextMilestone) {
                    getIO().to(`conversation:${conversation._id}`).emit("milestone:updated", nextMilestone);
                }
            }
        } catch (socketError) {
            console.error("Socket emission failed:", socketError);
        }

        // Notify freelancer
        await notifyFreelancerOnMilestoneApproved(milestone, contract);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Milestone approved successfully",
            data: {
                milestone,
                nextMilestoneActivated: nextMilestone ? nextMilestone._id : null,
            },
        });
    }
);

// ==========================================
// 6. REJECT MILESTONE (Client requests revision)
// ==========================================
export const rejectMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const currentUserId = req.currentUser?._id;
        const { rejectionReason } = req.body;

        if (!rejectionReason || !rejectionReason.trim()) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "A rejectionReason is required when requesting revisions on a milestone",
                    statusText: statusText.FAIL,
                })
            );
        }

        const milestone = await Milestone.findById(id).populate("contract");

        if (!milestone) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Milestone not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const contract = milestone.contract as any;
        if (contract?.client?.toString() !== currentUserId?.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "Only the client can request revisions on this milestone",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (milestone.status !== MilestoneStatus.SUBMITTED) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: `Cannot reject milestone in '${milestone.status}' status. Milestone must be SUBMITTED first.`,
                    statusText: statusText.FAIL,
                })
            );
        }

        milestone.status = MilestoneStatus.REJECTED;
        milestone.rejectedAt = new Date();
        milestone.rejectionReason = rejectionReason.trim();
        await milestone.save();

        try {
            const conversation = await Conversation.findOne({ contract: contract._id });
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("milestone:updated", milestone);
            }
        } catch (socketError) {
            console.error("Socket emission failed:", socketError);
        }

        // Notify freelancer
        await notifyFreelancerOnMilestoneRejected(milestone, contract);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Milestone revision requested with feedback",
            data: {
                milestone,
            },
        });
    }
);

// ==========================================
// 7. UPDATE MILESTONE (Client Edits Milestone Details)
// ==========================================
export const updateMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const currentUserId = req.currentUser?._id;
        const body = req.body;

        if (!body || Object.keys(body).length === 0) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Request body cannot be empty",
                    statusText: statusText.FAIL,
                })
            );
        }

        const milestone = await Milestone.findById(id).populate("contract");
        if (!milestone) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Milestone not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const contract = milestone.contract as any;
        if (contract?.client?.toString() !== currentUserId?.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You are not authorized to edit this milestone",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (contract.status !== ContractStatus.DRAFT) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Milestones can only be modified while the contract is in draft status",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (body.amount !== undefined) {
            const newAmount = Number(body.amount);
            if (isNaN(newAmount) || newAmount <= 0) {
                return next(
                    appError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        message: "Amount must be a positive number",
                        statusText: statusText.FAIL,
                    })
                );
            }

            const otherMilestones = await Milestone.find({
                contract: contract._id,
                _id: { $ne: milestone._id },
            });
            const otherAllocated = otherMilestones.reduce((sum, m) => sum + (m.amount || 0), 0);

            if (Math.round((otherAllocated + newAmount) * 100) > Math.round(contract.totalAmount * 100)) {
                const maxAllowed = Math.max(0, Math.round((contract.totalAmount - otherAllocated) * 100) / 100);
                return next(
                    appError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        message: `Updated amount exceeds remaining budget. Maximum allowed: $${maxAllowed}`,
                        statusText: statusText.FAIL,
                    })
                );
            }

            milestone.amount = Math.round(newAmount * 100) / 100;
        }

        if (body.title && body.title.trim()) milestone.title = body.title.trim();
        if (body.description !== undefined) {
            milestone.description = body.description && body.description.trim() ? body.description.trim() : null;
        }
        if (body.dueDate !== undefined) {
            milestone.dueDate = body.dueDate ? new Date(body.dueDate) : null;
        }

        await milestone.save();

        try {
            const conversation = await Conversation.findOne({ contract: contract._id });
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("milestone:updated", milestone);
            }
        } catch (socketError) {
            console.error("Socket emission failed:", socketError);
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Milestone updated successfully",
            data: {
                milestone,
            },
        });
    }
);

// ==========================================
// 8. DELETE MILESTONE (Client Deletes Milestone)
// ==========================================
export const deleteMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const currentUserId = req.currentUser?._id;

        const milestone = await Milestone.findById(id).populate("contract");
        if (!milestone) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Milestone not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const contract = milestone.contract as any;
        if (contract?.client?.toString() !== currentUserId?.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You are not authorized to delete this milestone",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (contract.status !== ContractStatus.DRAFT) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Milestones can only be deleted while the contract is in draft status",
                    statusText: statusText.FAIL,
                })
            );
        }

        const contractId = contract._id;
        await milestone.deleteOne();

        // Re-index remaining milestones order
        const remainingMilestones = await Milestone.find({ contract: contractId }).sort({ order: 1 });
        for (let i = 0; i < remainingMilestones.length; i++) {
            if (remainingMilestones[i].order !== i + 1) {
                remainingMilestones[i].order = i + 1;
                await remainingMilestones[i].save();
            }
        }

        try {
            const conversation = await Conversation.findOne({ contract: contractId });
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("milestone:deleted", {
                    milestoneId: id,
                    contractId,
                });
            }
        } catch (socketError) {
            console.error("Socket emission failed:", socketError);
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Milestone deleted successfully",
            data: null,
        });
    }
);