import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import {
    ContactSupportCategory,
    ContactSupportStatus,
} from "../../utils/enums.utils.js";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { statusText } from "../../utils/enums.utils.js";
import { ContactSupport } from "./contactSupport.model.js";

// ==========================================
// 1. GET ALL CONTACT SUPPORT TICKETS (Filter, Search & Pagination)
// ==========================================
export const getAllContactTickets = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const search = req.query.search as string | undefined;
        const status = req.query.status as ContactSupportStatus | undefined;
        const category = req.query.category as ContactSupportCategory | undefined;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const filter: Record<string, any> = {};

        // Search by fullName, email, or subject
        if (search) {
            filter.$or = [
                { fullName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { subject: { $regex: search, $options: "i" } },
            ];
        }

        if (status) {
            filter.status = status;
        }

        if (category) {
            filter.category = category;
        }

        const skip = (page - 1) * limit;

        const [tickets, totalItems] = await Promise.all([
            ContactSupport.find(filter)
                .populate("user", "firstName lastName email avatar role")
                .populate("assignedTo", "firstName lastName email avatar")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ContactSupport.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalItems / limit) || 1;

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Contact support tickets returned successfully",
            data: {
                tickets,
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
// 2. GET SINGLE TICKET BY ID
// ==========================================
export const getContactTicketById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const ticket = await ContactSupport.findById(id)
            .populate("user", "firstName lastName email avatar role")
            .populate("assignedTo", "firstName lastName email avatar");

        if (!ticket) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Support ticket not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Support ticket returned successfully",
            data: { ticket },
        });
    }
);

// ==========================================
// 3. CREATE TICKET (Public / Auth User)
// ==========================================
export const createContactTicket = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { fullName, email, subject, category, message, user } = req.body;

        // Mandatory fields check
        if (!fullName || !email || !subject || !message) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Full name, email, subject, and message are required fields",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Attach authenticated user ID if present in req.user or req.body
        const userId = (req as any).user?._id || user || null;

        const ticket = await ContactSupport.create({
            user: userId,
            fullName,
            email,
            subject,
            category: category || ContactSupportCategory.GENERAL_INQUIRY,
            message,
        });

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: "Support ticket submitted successfully",
            data: { ticket },
        });
    }
);

// ==========================================
// 4. UPDATE TICKET (Status, Assignment & Reply Metadata)
// ==========================================
export const updateContactTicket = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { status, assignedTo, repliedAt, resolvedAt } = req.body;

        const ticket = await ContactSupport.findById(id);

        if (!ticket) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Support ticket not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const updateData: Record<string, any> = {};

        if (status) updateData.status = status;
        if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
        if (repliedAt) updateData.repliedAt = repliedAt;
        if (resolvedAt) updateData.resolvedAt = resolvedAt;

        // Auto-set timestamps for resolution/replied status transitions if not explicitly passed
        if (status === ContactSupportStatus.RESOLVED && !resolvedAt) {
            updateData.resolvedAt = new Date();
        }

        const updatedTicket = await ContactSupport.findByIdAndUpdate(
            id,
            { $set: updateData },
            {
                new: true,
                runValidators: true,
            }
        )
            .populate("user", "firstName lastName email avatar role")
            .populate("assignedTo", "firstName lastName email avatar");

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Support ticket updated successfully",
            data: { ticket: updatedTicket },
        });
    }
);

// ==========================================
// 5. DELETE TICKET
// ==========================================
export const deleteContactTicket = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const deletedTicket = await ContactSupport.findByIdAndDelete(id);

        if (!deletedTicket) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Support ticket not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Support ticket deleted successfully",
            data: null,
        });
    }
);