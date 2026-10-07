import { param, body, query, validationResult } from "express-validator";
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

export const validatePaymentIdParam = [
    param("paymentId")
        .notEmpty()
        .withMessage("Payment ID is required")
        .isMongoId()
        .withMessage("Invalid payment ID format"),
    handleValidationErrors,
];

export const validateMilestoneIdParam = [
    param("milestoneId")
        .notEmpty()
        .withMessage("Milestone ID is required")
        .isMongoId()
        .withMessage("Invalid milestone ID format"),
    handleValidationErrors,
];

export const validatePayMilestoneBody = [
    body("paymentMethodId")
        .optional()
        .isMongoId()
        .withMessage("Invalid paymentMethodId format"),
    handleValidationErrors,
];

export const validateRefundPaymentBody = [
    body("amount")
        .optional()
        .isFloat({ min: 0.01 })
        .withMessage("Refund amount must be a positive number greater than 0"),
    body("reason")
        .optional()
        .isString()
        .trim()
        .isLength({ max: 500 })
        .withMessage("Refund reason cannot exceed 500 characters"),
    handleValidationErrors,
];

export const validateGetPaymentsQuery = [
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
        .withMessage("Invalid contract ID filter format"),
    query("milestone")
        .optional()
        .isMongoId()
        .withMessage("Invalid milestone ID filter format"),
    handleValidationErrors,
];
