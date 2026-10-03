import { param, body, validationResult } from "express-validator";
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

export const validatePaymentMethodIdParam = [
    param("id")
        .notEmpty()
        .withMessage("Payment method ID is required")
        .isMongoId()
        .withMessage("Invalid payment method ID format"),
    handleValidationErrors,
];

export const validateCreatePaymentMethodBody = [
    body().custom((value) => {
        if (!value?.stripePaymentMethodId && !value?.setupIntentId) {
            throw new Error("Either stripePaymentMethodId or setupIntentId is required");
        }
        return true;
    }),
    handleValidationErrors,
];
