import { param, query, validationResult } from "express-validator";
import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { appError } from "../../utils/appError.utils.js";
import { statusText } from "../../utils/enums.utils.js";

const handleValidationErrors = (req: Request, _res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map((err) => err.msg).join(", ");
        return next(
            appError({
                statusCode: StatusCodes.BAD_REQUEST,
                message: errorMessages || "Validation failed",
                statusText: statusText.FAIL,
            })
        );
    }
    next();
};

export const validateTransactionIdParam = [
    param("transactionId")
        .notEmpty()
        .withMessage("Transaction ID is required")
        .isMongoId()
        .withMessage("Invalid transaction ID format"),
    handleValidationErrors,
];

export const validateGetTransactionsQuery = [
    query("page")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Page must be a positive integer starting at 1"),
    query("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage("Limit must be between 1 and 100"),
    query("contract")
        .optional()
        .isMongoId()
        .withMessage("Invalid contract ID format"),
    query("milestone")
        .optional()
        .isMongoId()
        .withMessage("Invalid milestone ID format"),
    query("payment")
        .optional()
        .isMongoId()
        .withMessage("Invalid payment ID format"),
    handleValidationErrors,
];
