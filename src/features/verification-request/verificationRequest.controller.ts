import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { AttachmentEntityType, DocumentType, NotificationEntityType, NotificationType, statusText, VerificationStatus } from "../../utils/enums.utils.js";
import { VerificationRequest } from "./verificationRequest.model.js";
import { Attachment } from "../attachment/attachment.model.js";
import { destroyImageFromCloudinary } from "../../utils/cloudinary.utils.js";
import { deleteAttachmentsByEntity } from "../../utils/functions.js";
import { User } from "../user/user.model.js";
import jwt from 'jsonwebtoken'
import { Types } from "mongoose";
import { Notification } from "../notification/notification.model.js";
import { getIO } from "../../socket.js";

// ==========================================
// 1. CREATE VERIFICATION REQUEST (User)
// ==========================================
export const createVerificationRequest = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { user, documentType, notes } = req.body;

        if (!user) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "User ID is required",
                    statusText: statusText.FAIL,
                })
            );
        }


        if (!documentType) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "documentType is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (!Object.values(DocumentType).includes(documentType as DocumentType)) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Invalid document type provided",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Check if user already has an active pending or in-review request
        const existingActiveRequest = await VerificationRequest.findOne({
            user,
            status: { $in: [VerificationStatus.PENDING, VerificationStatus.IN_REVIEW] },
        });

        if (existingActiveRequest) {
            return next(
                appError({
                    statusCode: StatusCodes.CONFLICT,
                    message: "You already have an active verification request under review",
                    statusText: statusText.FAIL,
                })
            );
        }

        const newRequest = await VerificationRequest.create({
            user,
            documentType,
            notes: notes || null,
            status: VerificationStatus.PENDING,
            submittedAt: new Date(),
        });

        await newRequest.populate("user", "firstName lastName email avatar");

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: "Verification request submitted successfully",
            data: { verificationRequest: newRequest },
        });
    }
);

// ==========================================
// 2. GET ALL VERIFICATION REQUESTS (Admin Dashboard)
// ==========================================
export const getAllVerificationRequests = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { status, user, search, page = 1, limit = 10 } = req.query;

        const filter: Record<string, any> = {};

        // 1. Filter by status if provided
        if (status) {
            filter.status = status;
        }

        // 2. Filter by direct user ID if provided
        if (user) {
            filter.user = user;
        }

        // 3. Search by name, email, or VerificationRequest ID / User ID
        if (search && typeof search === "string" && search.trim() !== "") {
            const searchRegex = new RegExp(search.trim(), "i");
            const searchConditions: Record<string, any>[] = [];

            // Direct ID match check for VerificationRequest or User
            if (Types.ObjectId.isValid(search.trim())) {
                const targetId = new Types.ObjectId(search.trim());
                searchConditions.push({ _id: targetId });
                searchConditions.push({ user: targetId });
            }

            // Find matching users by name or email
            const matchingUsers = await User.find({
                $or: [
                    { firstName: searchRegex },
                    { lastName: searchRegex },
                    { email: searchRegex },
                ],
            }).select("_id");

            const matchingUserIds = matchingUsers.map((u) => u._id);

            if (matchingUserIds.length > 0) {
                searchConditions.push({ user: { $in: matchingUserIds } });
            }

            // Apply search conditions using $or
            if (searchConditions.length > 0) {
                filter.$or = searchConditions;
            } else {
                // If search query didn't match any valid ObjectId or User, return empty result
                filter._id = null;
            }
        }

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));
        const skip = (pageNum - 1) * limitNum;

        const [requests, totalRequests] = await Promise.all([
            VerificationRequest.find(filter)
                .populate("user", "firstName lastName email avatar role")
                .populate("reviewedBy", "firstName lastName email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            VerificationRequest.countDocuments(filter),
        ]);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Verification requests fetched successfully",
            data: {
                totalRequests,
                currentPage: pageNum,
                totalPages: Math.ceil(totalRequests / limitNum),
                requests,
            },
        });
    }
);

// ==========================================
// 3. GET SINGLE VERIFICATION REQUEST BY ID
// ==========================================
export const getVerificationRequestById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const verificationRequest = await VerificationRequest.findById(id)
            .populate("user", "firstName lastName email avatar role")
            .populate("reviewedBy", "firstName lastName email");

        if (!verificationRequest) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Verification request not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Verification request details fetched successfully",
            data: { verificationRequest },
        });
    }
);

// ==========================================
// GET VERIFICATION REQUEST(S) BY USER ID
// ==========================================
export const getVerificationByUserId = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { userId } = req.params;

        if (!userId) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "User ID is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Default: Get the latest verification request for this user
        const latestVerification = await VerificationRequest.findOne({ user: userId })
            .populate("user", "firstName lastName email avatar role")
            .populate("reviewedBy", "firstName lastName email")
            .sort({ createdAt: -1 });


        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Latest verification request fetched successfully",
            data: { verification: latestVerification },
        });
    }
);

// ==========================================
// 4. REVIEW VERIFICATION REQUEST (Admin Approve / Reject)
// ==========================================
export const reviewVerificationRequest = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { status, reviewedBy, rejectionReason, notes } = req.body;

        if (!status) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "status is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (!reviewedBy) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "reviewedBy (Admin ID) is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (![VerificationStatus.APPROVED, VerificationStatus.REJECTED, VerificationStatus.IN_REVIEW].includes(status)) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Invalid status. Must be IN_REVIEW, APPROVED, or REJECTED",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (status === VerificationStatus.REJECTED && !rejectionReason) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "A rejectionReason is required when rejecting a verification request",
                    statusText: statusText.FAIL,
                })
            );
        }

        const verification = await VerificationRequest.findById(id);
        if (!verification) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Verification request not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const currentUser = await User.findById(verification.user);

        // Update target user's identity verification state
        const isVerified = status === VerificationStatus.APPROVED ? true : status === VerificationStatus.REJECTED ? false : currentUser?.isIdentityVerified;

        const updatedUser = await User.findByIdAndUpdate(
            verification.user,
            { isIdentityVerified: isVerified },
            { new: true, runValidators: true }
        );

        // Update verification request payload
        const updatePayload: Record<string, any> = {
            status,
            reviewedBy,
            reviewedAt: new Date(),
        };

        if (rejectionReason !== undefined) updatePayload.rejectionReason = rejectionReason;
        if (notes !== undefined) updatePayload.notes = notes;

        const updatedRequest = await VerificationRequest.findByIdAndUpdate(
            id,
            { $set: updatePayload },
            { new: true, runValidators: true }
        )
            .populate("user", "firstName lastName email avatar")
            .populate("reviewedBy", "firstName lastName email");

        if (!updatedRequest) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Verification request not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Send token cookie if user identity was successfully verified
        if (updatedUser?.isIdentityVerified) {
            const token = jwt.sign(
                {
                    _id: updatedUser._id,
                    email: updatedUser.email,
                    role: updatedUser.role,
                    isEmailVerified: updatedUser.isEmailVerified,
                    isIdentityVerified: updatedUser.isIdentityVerified,
                },
                String(process.env.JWT_TOKEN_SECRET_KEY)
            );

            res.cookie("token", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                maxAge: 1000 * 60 * 60, // 1 hour
            });
        }

        // ==========================================
        // NOTIFICATION DISPATCH
        // ==========================================
        if (status === VerificationStatus.APPROVED || status === VerificationStatus.REJECTED) {
            const isApproved = status === VerificationStatus.APPROVED;

            const notificationType = isApproved
                ? NotificationType.VERIFICATION_APPROVED
                : NotificationType.VERIFICATION_REJECTED;

            const notificationTitle = isApproved
                ? "Identity Verification Approved"
                : "Identity Verification Rejected";

            const notificationMessage = isApproved
                ? "Your identity verification request has been approved. Please log out and log back in to update your session."
                : `Your identity verification request was rejected. Reason: ${rejectionReason}`;

            const notification = await Notification.create({
                recipient: verification.user,
                sender: reviewedBy,
                type: notificationType,
                title: notificationTitle,
                message: notificationMessage,
                entityType: NotificationEntityType.VERIFICATION,
                entityId: updatedRequest._id,
                link: "/verify-identity",
            });

            getIO().to(`user:${currentUser?._id}`).emit(notificationType, notification);
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: `Verification request marked as ${status}`,
            data: { verificationRequest: updatedRequest },
        });
    }
);

// ==========================================
// 5. DELETE VERIFICATION REQUEST BY ID
// ==========================================
export const deleteVerificationRequest = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        if (!id) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Verification request id is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        const deletedRequest =
            await VerificationRequest.findByIdAndDelete(id);

        if (!deletedRequest) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Verification request not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        await deleteAttachmentsByEntity(
            AttachmentEntityType.VERIFICATION,
            id as string
        );

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Verification request deleted successfully",
            data: null,
        });
    }
);