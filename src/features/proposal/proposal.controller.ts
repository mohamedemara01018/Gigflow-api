import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { AttachmentEntityType, JobStatus, ProposalStatus, statusText } from "../../utils/enums.utils.js";
import { Job } from "../job/job.model.js";
import { Proposal } from "./proposal.model.js";
import { deleteAttachmentsByEntity } from "../../utils/functions.js";
import {
    notifyClientOnProposalCreated,
    notifyFreelancerOnStatusUpdate,
} from "./proposal.notification.js";

// ==========================================
// 1. GET PROPOSALS (Supports filtering by Job or Freelancer)
// ==========================================
export const getAllProposals = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { job, freelancer, status, page = 1, limit = 10 } = req.query;

        const filter: Record<string, any> = {};

        if (job) filter.job = job;
        if (freelancer) filter.freelancer = freelancer;
        if (status) filter.status = status;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));
        const skip = (pageNum - 1) * limitNum;

        const [proposals, totalProposals] = await Promise.all([
            Proposal.find(filter)
                .populate("freelancer", "firstName lastName avatar email title")
                .populate({
                    path: "job",
                    select: "title budget status type client",
                    populate: { path: "client", select: "firstName lastName" },
                })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            Proposal.countDocuments(filter),
        ]);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Proposals fetched successfully",
            data: {
                totalProposals,
                currentPage: pageNum,
                totalPages: Math.ceil(totalProposals / limitNum),
                proposals,
            },
        });
    }
);

// ==========================================
// 2. GET SINGLE PROPOSAL BY ID
// ==========================================
export const getProposalById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const proposal = await Proposal.findById(id)
            .populate("freelancer", "firstName lastName avatar email title bio")
            .populate("job", "title budget status type client");

        if (!proposal) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Proposal not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Auto-mark proposal as viewed if a client reads it for the first time
        if (!proposal.clientViewed) {
            proposal.clientViewed = true;
            proposal.viewedAt = new Date();
            await proposal.save();
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Proposal details fetched successfully",
            data: { proposal },
        });
    }
);

// ==========================================
// 3. SUBMIT PROPOSAL
// ==========================================
export const createProposal = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { job, freelancer, coverLetter, bidAmount, estimatedDuration } = req.body;

        if (!job || !freelancer || !coverLetter || !bidAmount || !estimatedDuration?.value) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "job, freelancer, coverLetter, bidAmount, and estimatedDuration.value are required",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 1. Check if the target Job exists and is currently OPEN
        const targetJob = await Job.findById(job);
        if (!targetJob) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "The specified job does not exist",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (targetJob.status !== JobStatus.OPEN) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "You cannot submit a proposal to a job that is closed or not open",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 2. Check if maximum proposals limit has been reached
        if (targetJob.maxProposals && targetJob.proposalsCount >= targetJob.maxProposals) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "This job has reached its maximum allowed proposals",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 3. Check duplicate submission
        const existingProposal = await Proposal.findOne({ job, freelancer });
        if (existingProposal) {
            return next(
                appError({
                    statusCode: StatusCodes.CONFLICT,
                    message: "You have already submitted a proposal for this job",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 4. Create proposal and increment proposals count on job
        const newProposal = await Proposal.create({
            job,
            freelancer,
            coverLetter,
            bidAmount,
            estimatedDuration,
            status: ProposalStatus.PENDING,
        });

        await Job.findByIdAndUpdate(job, { $inc: { proposalsCount: 1 } });

        await newProposal.populate([
            { path: "freelancer", select: "firstName lastName email" },
            { path: "job", select: "title budget client" },
        ]);

        // DISPATCH NOTIFICATION TO CLIENT
        await notifyClientOnProposalCreated(newProposal);

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: "Proposal submitted successfully",
            data: { proposal: newProposal },
        });
    }
);

// ==========================================
// 4. UPDATE PROPOSAL DETAILS (Content, Bid, Duration)
// ==========================================
export const updateProposal = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { coverLetter, bidAmount, estimatedDuration } = req.body;

        const proposal = await Proposal.findById(id);

        if (!proposal) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Proposal not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Allow updates only if the proposal is still PENDING or SHORTLISTED
        if (
            proposal.status !== ProposalStatus.PENDING &&
            proposal.status !== ProposalStatus.SHORTLISTED
        ) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Cannot update a proposal that has already been accepted, rejected, or withdrawn",
                    statusText: statusText.FAIL,
                })
            );
        }

        const updateFields: Record<string, any> = {};

        if (coverLetter !== undefined) updateFields.coverLetter = coverLetter;
        if (bidAmount !== undefined) updateFields.bidAmount = bidAmount;
        if (estimatedDuration !== undefined) updateFields.estimatedDuration = estimatedDuration;

        if (Object.keys(updateFields).length === 0) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "At least one field (coverLetter, bidAmount, estimatedDuration) is required to update",
                    statusText: statusText.FAIL,
                })
            );
        }

        const updatedProposal = await Proposal.findByIdAndUpdate(
            id,
            { $set: updateFields },
            { new: true, runValidators: true }
        )
            .populate("freelancer", "firstName lastName avatar email title")
            .populate("job", "title budget status type client");

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Proposal updated successfully",
            data: { proposal: updatedProposal },
        });
    }
);

// ==========================================
// 5. UPDATE PROPOSAL STATUS (Accept, Reject, Shortlist)
// ==========================================
export const updateProposalStatus = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !Object.values(ProposalStatus).includes(status)) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Valid status is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        const updateData: Record<string, any> = { status };

        if (status === ProposalStatus.ACCEPTED) updateData.acceptedAt = new Date();
        if (status === ProposalStatus.REJECTED) updateData.rejectedAt = new Date();
        if (status === ProposalStatus.WITHDRAWN) updateData.withdrawnAt = new Date();

        const updatedProposal = await Proposal.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        )
            .populate("freelancer", "firstName lastName avatar email")
            .populate("job", "title client");

        if (!updatedProposal) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Proposal not found",
                    statusText: statusText.FAIL,
                })
            );
        }
        if (status === ProposalStatus.ACCEPTED) {
            await Job.findByIdAndUpdate(
                updatedProposal.job._id,
                { $inc: { interviewCount: 1 } },
                { new: true, runValidators: true }
            )
        }


        // DISPATCH NOTIFICATION TO FREELANCER
        await notifyFreelancerOnStatusUpdate(updatedProposal, (req as any).user?._id);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: `Proposal status updated to ${status}`,
            data: { proposal: updatedProposal },
        });
    }
);

// ==========================================
// 6. WITHDRAW / DELETE PROPOSAL
// ==========================================
export const deleteProposal = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const proposal = await Proposal.findById(id);

        if (!proposal) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Proposal not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        await Proposal.findByIdAndDelete(id);

        // Decrement proposals counter on Job schema
        await Job.findByIdAndUpdate(proposal.job, { $inc: { proposalsCount: -1 } });

        // Clean up external storage & database records for attachments linked to this job
        await deleteAttachmentsByEntity(
            AttachmentEntityType.PROPOSAL,
            id as string
        );

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Proposal and associated attachments withdrawn/deleted successfully",
            data: null,
        });
    }
);