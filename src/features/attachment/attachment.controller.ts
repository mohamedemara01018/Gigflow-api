import 'multer';
import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { AttachmentEntityType, cloudinaryFolderPath, statusText } from "../../utils/enums.utils.js";
import { Attachment } from "./attachment.model.js";
import { destroyImageFromCloudinary, ICloudinaryProbs, uploadImageToCloudinary } from "../../utils/cloudinary.utils.js";

// Models for entity validation
import { VerificationRequest } from "../verification-request/verificationRequest.model.js";
import { Job } from "../job/job.model.js";
import { Proposal } from "../proposal/proposal.model.js";

// Helper map to dynamically fetch the target entity model
const entityModelMap: Partial<Record<AttachmentEntityType, mongoose.Model<any>>> = {
    [AttachmentEntityType.VERIFICATION]: VerificationRequest,
    [AttachmentEntityType.JOB]: Job,
    [AttachmentEntityType.PROPOSAL]: Proposal,
    // [AttachmentEntityType.MESSAGE]: Message,
    // [AttachmentEntityType.MILESTONE]: Milestone,
    // [AttachmentEntityType.PORTFOLIO]: Portfolio,
};

// ==========================================
// 1. GET ALL ATTACHMENTS (Filter by entity, user, or fileType)
// ==========================================
export const getAllAttachments = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { entityType, entityId, uploadedBy, fileType, page = 1, limit = 10 } = req.query;

        const filter: Record<string, any> = {};

        if (entityType) filter.entityType = entityType;
        if (entityId) filter.entityId = entityId;
        if (uploadedBy) filter.uploadedBy = uploadedBy;
        if (fileType) filter.fileType = fileType;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));
        const skip = (pageNum - 1) * limitNum;

        const [attachments, totalAttachments] = await Promise.all([
            Attachment.find(filter)
                .populate("uploadedBy", "firstName lastName avatar email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            Attachment.countDocuments(filter),
        ]);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Attachments fetched successfully",
            data: {
                totalAttachments,
                currentPage: pageNum,
                totalPages: Math.ceil(totalAttachments / limitNum),
                attachments,
            },
        });
    }
);

// ==========================================
// 2. GET ATTACHMENTS FOR A SPECIFIC ENTITY
// ==========================================
export const getEntityAttachments = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { entityType, entityId } = req.params;

        if (!Object.values(AttachmentEntityType).includes(entityType as AttachmentEntityType)) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Invalid entity type provided",
                    statusText: statusText.FAIL,
                })
            );
        }

        const attachments = await Attachment.find({ entityType: entityType as AttachmentEntityType, entityId })
            .populate("uploadedBy", "firstName lastName avatar")
            .sort({ createdAt: -1 });

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: `Attachments for ${entityType} fetched successfully`,
            data: { attachments },
        });
    }
);

// ==========================================
// 3. GET SINGLE ATTACHMENT BY ID
// ==========================================
export const getAttachmentById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const attachment = await Attachment.findById(id).populate("uploadedBy", "firstName lastName avatar email");

        if (!attachment) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Attachment not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Attachment details fetched successfully",
            data: { attachment },
        });
    }
);

// ==========================================
// 4. CREATE SINGLE OR BULK ATTACHMENTS
// ==========================================
export const createAttachment = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        // Extract uploaded files from Multer
        let fileList: Express.Multer.File[] = [];

        if (Array.isArray(req.files)) {
            fileList = req.files;
        } else if (req.files && typeof req.files === "object") {
            fileList = Object.values(req.files).flat();
        } else if (req.file) {
            fileList = [req.file];
        }

        // 1. Validation for empty files payload
        if (!fileList || fileList.length === 0) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Attachment payload cannot be empty. Please upload at least one file.",
                    statusText: statusText.FAIL,
                })
            );
        }

        const { entityId, entityType } = req.body;
        const uploadedBy = (req as any).user?._id || req.body.uploadedBy;

        if (!entityId || !mongoose.Types.ObjectId.isValid(entityId)) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "A valid entityId ObjectID is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (!entityType || !Object.values(AttachmentEntityType).includes(entityType)) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: `entityType is required and must be one of: ${Object.values(AttachmentEntityType).join(", ")}`,
                    statusText: statusText.FAIL,
                })
            );
        }

        if (!uploadedBy) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "uploadedBy is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 2. Validate entity existence dynamically across registered models
        const TargetModel = entityModelMap[entityType as AttachmentEntityType];
        if (TargetModel) {
            const entityExists = await TargetModel.exists({ _id: entityId });
            if (!entityExists) {
                return next(
                    appError({
                        statusCode: StatusCodes.NOT_FOUND,
                        message: `Target ${entityType} entity with ID '${entityId}' does not exist`,
                        statusText: statusText.FAIL,
                    })
                );
            }
        }

        // 3. Concurrently upload files to Cloudinary targeting destination folder & resource type
        const uploadPromises = fileList.map((file) => {
            const isPdf = file.mimetype.includes("pdf");
            const fileName = isPdf
                ? `pdf-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`
                : `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

            // Determine dynamic target folder by MIME type
            const targetFolder = isPdf
                ? cloudinaryFolderPath.PDF
                : cloudinaryFolderPath.IMAGE;

            // Pass resource_type as "raw" for PDFs, "image" for images
            return uploadImageToCloudinary(
                file.buffer,
                targetFolder,
                fileName,
                isPdf ? "raw" : "image"
            ) as Promise<ICloudinaryProbs>;
        });

        const uploadResults = await Promise.all(uploadPromises);

        // 4. Map uploaded data to Attachment schema structure
        const attachmentsToCreate = uploadResults.map((result, index) => ({
            url: result.secure_url,
            publicId: result.public_id,
            originalName: fileList[index].originalname,
            mimeType: fileList[index].mimetype,
            fileName: result.display_name || fileList[index].originalname,
            size: fileList[index].size,
            entityId,
            entityType,
            uploadedBy,
        }));

        // 5. Save to Database
        const createdAttachments = await Attachment.insertMany(attachmentsToCreate);

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: `${createdAttachments.length} attachment(s) uploaded successfully`,
            data: { attachments: createdAttachments },
        });
    }
);

// ==========================================
// 5. DELETE ATTACHMENT BY ID
// ==========================================
export const deleteAttachment = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const deletedAttachment = await Attachment.findByIdAndDelete(id);

        if (!deletedAttachment) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Attachment not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (deletedAttachment.publicId) {
            const isPdf = deletedAttachment.mimeType?.includes("pdf");
            await destroyImageFromCloudinary(
                deletedAttachment.publicId,
                isPdf ? "raw" : "image"
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Attachment record deleted successfully",
            data: null,
        });
    }
);