import { Router } from "express";
import {
    getTransactionById,
    getUserTransactions,
    getAdminTransactions,
} from "./transaction.controller.js";
import { authenticationMiddleware } from "../../middleware/authentication.middleware.js";
import { authorizationMiddleware } from "../../middleware/authorization.middleware.js";
import { UserRole } from "../../utils/enums.utils.js";
import {
    validateTransactionIdParam,
    validateGetTransactionsQuery,
} from "./transaction.validation.js";

const router = Router();

// All transaction routes require authentication
router.use(authenticationMiddleware);

// 1. Admin: View all platform transactions
router.get(
    "/admin",
    authorizationMiddleware([UserRole.ADMIN]),
    validateGetTransactionsQuery,
    getAdminTransactions
);

router.get(
    "/admin/all",
    authorizationMiddleware([UserRole.ADMIN]),
    validateGetTransactionsQuery,
    getAdminTransactions
);

// 2. Get current user's transactions with pagination and filters
router.get("/", validateGetTransactionsQuery, getUserTransactions);

// 3. Get single transaction details by ID
router.get("/:transactionId", validateTransactionIdParam, getTransactionById);

export default router;
