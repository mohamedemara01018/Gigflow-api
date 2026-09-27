import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import {
    AttachmentEntityType,
    JobStatus,
    statusText,
} from "../../utils/enums.utils.js";
import { Job } from "./job.model.js";
import { deleteAttachmentsByEntity } from "../../utils/functions.js";
import { Proposal } from "../proposal/proposal.model.js";
import { notifyFreelancersOnJobDeletion } from "./job.notification.js";

// ==========================================
// 1. GET ALL JOBS (With Search, Filtering & Pagination)
// ==========================================
export const getAllJobs = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const {
            search,
            category,
            type,
            experienceLevel,
            status,
            minBudget,
            maxBudget,
            client,
            page = 1,
            limit = 10,
        } = req.query;

        const filter: Record<string, any> = {};

        // Default to OPEN status if not explicitly passed
        filter.status = status || JobStatus.OPEN;

        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ];
        }

        if (category) filter.category = category;
        if (type) filter.type = type;
        if (experienceLevel) filter.experienceLevel = experienceLevel;
        if (client) filter.client = client;

        // Dynamic budget / hourly rate filtering
        if (minBudget || maxBudget) {
            const min = minBudget ? Number(minBudget) : 0;
            const max = maxBudget ? Number(maxBudget) : Infinity;

            filter.$or = [
                { budget: { $gte: min, $lte: max } },
                {
                    hourlyRateFrom: { $gte: min },
                    hourlyRateTo: { $lte: max },
                },
            ];
        }

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));
        const skip = (pageNum - 1) * limitNum;

        const [jobs, totalJobs] = await Promise.all([
            Job.find(filter)
                .populate("client", "firstName lastName avatar email")
                .populate("category", "name")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Job.countDocuments(filter),
        ]);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Jobs fetched successfully",
            data: {
                totalJobs,
                currentPage: pageNum,
                totalPages: Math.ceil(totalJobs / limitNum),
                jobs,
            },
        });
    }
);

// ==========================================
// 2. GET SINGLE JOB BY ID
// ==========================================
export const getJobById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const job = await Job.findById(id)
            .populate("client", "firstName lastName avatar email")
            .populate("category", "name");

        if (!job) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Job posting not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Job details fetched successfully",
            data: {
                job,
            },
        });
    }
);

// ==========================================
// 3. CREATE JOB POSTING
// ==========================================
export const createJob = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const {
            client,
            category,
            title,
            description,
            type,
            budget,
            hourlyRateFrom,
            hourlyRateTo,
            duration,
            experienceLevel,
            visibility,
            location,
            maxProposals,
            status,
        } = req.body;

        if (!client || !category || !title || !description || !type || budget === undefined) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "client, category, title, description, type, and budget are required fields",
                    statusText: statusText.FAIL,
                })
            );
        }

        const newJob = await Job.create({
            client,
            category,
            title,
            description,
            type,
            budget,
            hourlyRateFrom: hourlyRateFrom || null,
            hourlyRateTo: hourlyRateTo || null,
            duration: duration || null,
            experienceLevel,
            visibility,
            location,
            maxProposals: maxProposals || null,
            status: status || JobStatus.OPEN,
            publishedAt: new Date(),
        });

        await newJob.populate([
            { path: "category", select: "name" },
            { path: "client", select: "firstName lastName email" },
        ]);

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: "Job posted successfully",
            data: {
                job: newJob,
            },
        });
    }
);

// ==========================================
// 4. EDIT / UPDATE JOB POSTING
// ==========================================
export const editJob = asyncWrapper(
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

        // Auto set closedAt timestamp if status is being updated to closed or cancelled
        if (body.status && (body.status === JobStatus.CLOSED || body.status === JobStatus.CANCELLED)) {
            body.closedAt = new Date();
        }

        const updatedJob = await Job.findByIdAndUpdate(
            id,
            { $set: body },
            {
                new: true,
                runValidators: true,
            }
        )
            .populate("client", "firstName lastName avatar email")
            .populate("category", "name");

        if (!updatedJob) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Job posting not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Job posting updated successfully",
            data: {
                job: updatedJob,
            },
        });
    }
);

// ==========================================
// 5. DELETE JOB POSTING
// ==========================================
export const deleteJob = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        if (!id) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Job id is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        const job = await Job.findById(id);

        if (!job) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Job posting not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 1. Fetch proposals with freelancer IDs
        const proposals = await Proposal.find({ job: id }).select("_id freelancer");

        if (proposals.length > 0) {
            // 2. Cascade cleanup attachments for each proposal
            await Promise.all(
                proposals.map((proposal) =>
                    deleteAttachmentsByEntity(
                        AttachmentEntityType.PROPOSAL,
                        proposal._id.toString()
                    )
                )
            );

            // 3. Delegate notification dispatching to job.notification module
            console.log('currentUser', req.currentUser)

            await notifyFreelancersOnJobDeletion(
                job,
                proposals,
                job.client._id
            );

            // 4. Delete all proposals related to this job
            await Proposal.deleteMany({ job: id });
        }

        // 5. Clean up attachments linked directly to the job
        await deleteAttachmentsByEntity(
            AttachmentEntityType.JOB,
            id as string
        );

        // 6. Delete the job document
        await Job.findByIdAndDelete(id);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Job posting, associated proposals, and related attachments deleted successfully",
            data: null,
        });
    }
);