import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import { Review } from "./review.model.js";
import { Contract } from "../contract/contract.model.js";
import { Profile } from "../profile/profile.model.js";
import { ClientStats } from "../clientStats/clientStats.model.js";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { ContractStatus, statusText, UserRole } from "../../utils/enums.utils.js";

// ==========================================
// 1. SUBMIT REVIEW FOR COMPLETED CONTRACT
// ==========================================
export const createReview = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id;
        if (!currentUserId) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized",
                    statusText: statusText.FAIL,
                })
            );
        }
        const { contract: contractParam, contractId: contractIdParam, rating, comment } = req.body;

        const targetContractId = contractParam || contractIdParam;

        if (!targetContractId) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "contractId is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        const numRating = Number(rating);
        if (!numRating || isNaN(numRating) || numRating < 1 || numRating > 5) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Rating must be a number between 1 and 5",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (!comment || !comment.trim()) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Review comment cannot be empty",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 1. Find Contract
        const contract = await Contract.findById(targetContractId);
        if (!contract) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Contract not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 2. Verify Contract is COMPLETED
        if (contract.status !== ContractStatus.COMPLETED && (contract.status as string) !== "completed") {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Reviews can only be submitted for completed contracts",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 3. Verify user is either Client or Freelancer of this contract
        const clientId = contract.client.toString();
        const freelancerId = contract.freelancer.toString();
        const userIdStr = currentUserId.toString();

        let reviewer: Types.ObjectId;
        let reviewee: Types.ObjectId;
        let isReviewingFreelancer = false;

        if (userIdStr === clientId) {
            reviewer = contract.client;
            reviewee = contract.freelancer;
            isReviewingFreelancer = true;
        } else if (userIdStr === freelancerId) {
            reviewer = contract.freelancer;
            reviewee = contract.client;
            isReviewingFreelancer = false;
        } else {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You are not a participant in this contract",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 4. Check if Review already exists for this reviewer on this contract
        const existingReview = await Review.findOne({
            contract: contract._id,
            reviewer,
        });

        if (existingReview) {
            return next(
                appError({
                    statusCode: StatusCodes.CONFLICT,
                    message: "You have already submitted a review for this contract",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 5. Create Review
        const newReview = await Review.create({
            contract: contract._id,
            job: contract.job,
            reviewer,
            reviewee,
            rating: Math.round(numRating),
            comment: comment.trim(),
        });

        // 6. Update Aggregate Rating for the Reviewee
        try {
            const aggregateStats = await Review.aggregate([
                { $match: { reviewee: new Types.ObjectId(reviewee.toString()) } },
                {
                    $group: {
                        _id: null,
                        avgRating: { $avg: "$rating" },
                        total: { $sum: 1 },
                    },
                },
            ]);

            const avgRating = aggregateStats.length > 0 ? Math.round(aggregateStats[0].avgRating * 10) / 10 : Math.round(numRating);
            const total = aggregateStats.length > 0 ? aggregateStats[0].total : 1;

            if (isReviewingFreelancer) {
                await Profile.findOneAndUpdate(
                    { user: reviewee },
                    { averageRating: avgRating, totalReviews: total },
                    { upsert: true }
                );
            } else {
                await ClientStats.findOneAndUpdate(
                    { client: reviewee },
                    { rating: avgRating, totalReviews: total },
                    { upsert: true }
                );
            }
        } catch (statErr) {
            console.error("[Review Aggregate Update Error]:", statErr);
        }

        await newReview.populate([
            { path: "reviewer", select: "firstName lastName avatar email role" },
            { path: "reviewee", select: "firstName lastName avatar email role" },
        ]);

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: "Review submitted successfully",
            data: {
                review: newReview,
            },
        });
    }
);

// ==========================================
// 2. GET REVIEWS FOR A CONTRACT
// ==========================================
export const getContractReviews = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { contractId } = req.params;

        const reviews = await Review.find({ contract: contractId })
            .populate("reviewer", "firstName lastName avatar email role")
            .populate("reviewee", "firstName lastName avatar email role")
            .sort({ createdAt: -1 });

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Contract reviews retrieved successfully",
            data: {
                reviews,
            },
        });
    }
);

// ==========================================
// 3. GET REVIEWS RECEIVED BY A USER
// ==========================================
export const getUserReviews = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { userId } = req.params;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.max(1, Number(req.query.limit) || 10);
        const skip = (page - 1) * limit;

        const [reviews, total] = await Promise.all([
            Review.find({ reviewee: userId })
                .populate("reviewer", "firstName lastName avatar email role")
                .populate("job", "title")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Review.countDocuments({ reviewee: userId }),
        ]);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "User reviews retrieved successfully",
            data: {
                reviews,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit) || 1,
                },
            },
        });
    }
);
