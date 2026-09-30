import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { ContractStatus, MilestoneStatus, statusText } from "../../utils/enums.utils.js";
import { Milestone } from "./milestone.model.js";
import { Contract } from "../contract/contract.model.js";

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

        const milestone = await Milestone.findById(id).populate("contract", "title status client freelancer");

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
// 3. CREATE A SINGLE MILESTONE
// ==========================================
export const createMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { contract: contractId, title, description, amount, order, dueDate } = req.body;

        if (!contractId || !title || amount === undefined) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "contract, title, and amount are required fields",
                    statusText: statusText.FAIL,
                })
            );
        }

        const contract = await Contract.findById(contractId);
        if (!contract) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Associated contract not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Calculate order if not provided
        let milestoneOrder = order;
        if (!milestoneOrder) {
            const count = await Milestone.countDocuments({ contract: contractId });
            milestoneOrder = count + 1;
        }

        const newMilestone = await Milestone.create({
            contract: contractId,
            title,
            description: description || null,
            amount,
            order: milestoneOrder,
            dueDate: dueDate || null,
            status: MilestoneStatus.PENDING,
        });

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
// Flow Step: Freelancer submits -> Milestone = SUBMITTED
// ==========================================
export const submitMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const milestone = await Milestone.findById(id);

        if (!milestone) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Milestone not found",
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
        await milestone.save();

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
// 5. APPROVE MILESTONE (Client approves & triggers Payment)
// Flow Step: Client approves -> Milestone = APPROVED -> Trigger next milestone / contract completion
// ==========================================
export const approveMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const milestone = await Milestone.findById(id);

        if (!milestone) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Milestone not found",
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

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Milestone approved successfully. Payment released.",
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
        const { rejectionReason } = req.body;

        if (!rejectionReason) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "A rejectionReason is required when rejecting a milestone",
                    statusText: statusText.FAIL,
                })
            );
        }

        const milestone = await Milestone.findById(id);

        if (!milestone) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Milestone not found",
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
        milestone.rejectionReason = rejectionReason;
        await milestone.save();

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Milestone rejected with revision details",
            data: {
                milestone,
            },
        });
    }
);

// ==========================================
// 7. UPDATE MILESTONE (General Update)
// ==========================================
export const updateMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
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

        const updatedMilestone = await Milestone.findByIdAndUpdate(
            id,
            { $set: body },
            { new: true, runValidators: true }
        );

        if (!updatedMilestone) {
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
            message: "Milestone updated successfully",
            data: {
                milestone: updatedMilestone,
            },
        });
    }
);

// ==========================================
// 8. DELETE MILESTONE
// ==========================================
export const deleteMilestone = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const milestone = await Milestone.findByIdAndDelete(id);

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
            message: "Milestone deleted successfully",
            data: null,
        });
    }
);