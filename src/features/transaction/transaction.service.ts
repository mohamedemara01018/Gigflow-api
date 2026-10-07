import { StatusCodes } from "http-status-codes";
import { appError } from "../../utils/appError.utils.js";
import { statusText, UserRole } from "../../utils/enums.utils.js";
import Transaction, {
    TransactionDirection,
    TransactionStatus,
    TransactionType,
} from "./transaction.model.js";

export interface ITransactionFilterOptions {
    userId?: string;
    userRole?: string;
    type?: string;
    status?: string;
    direction?: string;
    contract?: string;
    milestone?: string;
    payment?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    clientId?: string;
    freelancerId?: string;
    targetUserId?: string;
}

/**
 * Get Single Transaction by ID with strict ownership/role verification
 */
export const getTransactionByIdService = async (
    userId: string,
    userRole: string,
    transactionId: string
) => {
    const transaction = await Transaction.findById(transactionId)
        .populate("contract", "title status totalAmount type")
        .populate("milestone", "title amount order status")
        .populate("client", "firstName lastName email")
        .populate("freelancer", "firstName lastName email")
        .populate("payment", "amount platformFee freelancerAmount currency method status paidAt")
        .select("-__v");

    if (!transaction) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Transaction not found",
            statusText: statusText.FAIL,
        });
    }

    const clientId = transaction.client
        ? (transaction.client as any)._id?.toString() || transaction.client.toString()
        : null;
    const freelancerId = transaction.freelancer
        ? (transaction.freelancer as any)._id?.toString() || transaction.freelancer.toString()
        : null;

    if (userRole === UserRole.CLIENT && clientId !== userId.toString()) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "You are not authorized to view this transaction",
            statusText: statusText.FAIL,
        });
    }

    if (userRole === UserRole.FREELANCER && freelancerId !== userId.toString()) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "You are not authorized to view this transaction",
            statusText: statusText.FAIL,
        });
    }

    return transaction;
};

/**
 * Get Paginated Transactions for the current authenticated user
 */
export const getUserTransactionsService = async (options: ITransactionFilterOptions) => {
    const {
        userId,
        userRole,
        type,
        status,
        direction,
        contract,
        milestone,
        payment,
        startDate,
        endDate,
        page = 1,
        limit = 10,
    } = options;

    const query: any = {};

    // Enforce role-based isolation
    if (userRole === UserRole.CLIENT) {
        query.client = userId;
    } else if (userRole === UserRole.FREELANCER) {
        query.freelancer = userId;
    }

    // Optional filters
    if (type && Object.values(TransactionType).includes(type as TransactionType)) {
        query.type = type;
    }

    if (status && Object.values(TransactionStatus).includes(status as TransactionStatus)) {
        query.status = status;
    }

    if (direction && Object.values(TransactionDirection).includes(direction as TransactionDirection)) {
        query.direction = direction;
    }

    if (contract) query.contract = contract;
    if (milestone) query.milestone = milestone;
    if (payment) query.payment = payment;

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const currentPage = Math.max(1, Number(page));
    const pageLimit = Math.min(100, Math.max(1, Number(limit)));
    const skip = (currentPage - 1) * pageLimit;

    const [transactions, total] = await Promise.all([
        Transaction.find(query)
            .populate("contract", "title status totalAmount")
            .populate("milestone", "title amount order status")
            .populate("client", "firstName lastName email")
            .populate("freelancer", "firstName lastName email")
            .populate("payment", "amount currency method status paidAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageLimit)
            .select("-__v"),
        Transaction.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / pageLimit);

    return {
        transactions,
        total,
        page: currentPage,
        totalPages,
        limit: pageLimit,
    };
};

/**
 * Admin: Get all transactions across the platform with advanced filtering
 */
export const getAdminTransactionsService = async (options: ITransactionFilterOptions) => {
    const {
        type,
        status,
        direction,
        contract,
        milestone,
        payment,
        startDate,
        endDate,
        clientId,
        freelancerId,
        targetUserId,
        page = 1,
        limit = 10,
    } = options;

    const query: any = {};

    if (targetUserId) {
        query.$or = [{ client: targetUserId }, { freelancer: targetUserId }];
    }

    if (clientId) query.client = clientId;
    if (freelancerId) query.freelancer = freelancerId;

    if (type && Object.values(TransactionType).includes(type as TransactionType)) {
        query.type = type;
    }

    if (status && Object.values(TransactionStatus).includes(status as TransactionStatus)) {
        query.status = status;
    }

    if (direction && Object.values(TransactionDirection).includes(direction as TransactionDirection)) {
        query.direction = direction;
    }

    if (contract) query.contract = contract;
    if (milestone) query.milestone = milestone;
    if (payment) query.payment = payment;

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const currentPage = Math.max(1, Number(page));
    const pageLimit = Math.min(100, Math.max(1, Number(limit)));
    const skip = (currentPage - 1) * pageLimit;

    const [transactions, total] = await Promise.all([
        Transaction.find(query)
            .populate("contract", "title status totalAmount")
            .populate("milestone", "title amount order status")
            .populate("client", "firstName lastName email")
            .populate("freelancer", "firstName lastName email")
            .populate("payment", "amount currency method status paidAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageLimit)
            .select("-__v"),
        Transaction.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / pageLimit);

    return {
        transactions,
        total,
        page: currentPage,
        totalPages,
        limit: pageLimit,
    };
};
