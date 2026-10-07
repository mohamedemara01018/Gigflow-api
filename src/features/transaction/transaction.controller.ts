import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { appError } from "../../utils/appError.utils.js";
import { statusText, UserRole } from "../../utils/enums.utils.js";
import {
    getTransactionByIdService,
    getUserTransactionsService,
    getAdminTransactionsService,
} from "./transaction.service.js";

// ==========================================
// 1. GET TRANSACTION BY ID
// ==========================================
export const getTransactionById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();
        const currentUserRole = req.currentUser?.role;
        const { transactionId } = req.params;

        if (!currentUserId || !currentUserRole) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const transaction = await getTransactionByIdService(
            currentUserId,
            currentUserRole,
            String(transactionId)
        );

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Transaction details retrieved successfully",
            data: {
                transaction,
            },
        });
    }
);

// ==========================================
// 2. GET CURRENT USER'S TRANSACTIONS (PAGINATED WITH FILTERS)
// ==========================================
export const getUserTransactions = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id?.toString();
        const currentUserRole = req.currentUser?.role;

        if (!currentUserId || !currentUserRole) {
            return next(
                appError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    message: "Unauthorized access",
                    statusText: statusText.FAIL,
                })
            );
        }

        const {
            type,
            status,
            direction,
            contract,
            milestone,
            payment,
            startDate,
            endDate,
            page,
            limit,
        } = req.query;

        const result = await getUserTransactionsService({
            userId: currentUserId,
            userRole: currentUserRole,
            type: type as string,
            status: status as string,
            direction: direction as string,
            contract: contract as string,
            milestone: milestone as string,
            payment: payment as string,
            startDate: startDate as string,
            endDate: endDate as string,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 10,
        });

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Transactions retrieved successfully",
            data: result,
        });
    }
);

// ==========================================
// 3. ADMIN: GET ALL TRANSACTIONS ACROSS PLATFORM
// ==========================================
export const getAdminTransactions = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserRole = req.currentUser?.role;

        if (currentUserRole !== UserRole.ADMIN) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "Admin privileges required to access platform ledger",
                    statusText: statusText.FAIL,
                })
            );
        }

        const {
            user: targetUserId,
            client: clientId,
            freelancer: freelancerId,
            type,
            status,
            direction,
            contract,
            milestone,
            payment,
            startDate,
            endDate,
            page,
            limit,
        } = req.query;

        const result = await getAdminTransactionsService({
            targetUserId: targetUserId as string,
            clientId: clientId as string,
            freelancerId: freelancerId as string,
            type: type as string,
            status: status as string,
            direction: direction as string,
            contract: contract as string,
            milestone: milestone as string,
            payment: payment as string,
            startDate: startDate as string,
            endDate: endDate as string,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 10,
        });

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            success: true,
            message: "Platform transactions retrieved successfully",
            data: result,
        });
    }
);
