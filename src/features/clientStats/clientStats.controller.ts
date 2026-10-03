import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { appError } from "../../utils/appError.utils.js";
import { statusText } from "../../utils/enums.utils.js";
import { Job } from "../job/job.model.js";
import { User } from "../user/user.model.js";
import { ClientStats } from "./clientStats.model.js";
import { PaymentMethodModel } from "../payment-method/paymentMethod.model.js";

export const getClientStats = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id: clientId } = req.params;

        if (!clientId) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Client ID is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 1. Fetch client details with populated country and city locations
        const client = await User.findById(clientId)
            .populate("country", "name code")
            .populate("city", "name")
            .lean();

        if (!client) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Client not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 2. Concurrently fetch job metrics and check active payment methods
        const [totalJobsPosted, totalJobsHired, hasPaymentMethod] = await Promise.all([
            Job.countDocuments({ client: clientId }),
            Job.countDocuments({ client: clientId, hiresCount: { $gt: 0 } }),
            PaymentMethodModel.exists({ user: clientId, isActive: true }),
        ]);

        // 3. Calculate Hire Rate percentage (0 - 100)
        const hireRate =
            totalJobsPosted > 0
                ? Math.round((totalJobsHired / totalJobsPosted) * 100)
                : 0;

        const paymentVerified = Boolean(hasPaymentMethod);

        // 4. Upsert ClientStats
        const clientStats = await ClientStats.findOneAndUpdate(
            { client: clientId },
            {
                $set: {
                    totalJobsPosted,
                    totalJobsHired,
                    hireRate,
                    paymentVerified,
                },
                $setOnInsert: {
                    rating: 0,
                    totalReviews: 0,
                    totalSpent: 0,
                },
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
            }
        );

        // 5. Structure location response object
        const location = {
            country: client.country || null,
            city: client.city || null,
        };

        // 6. Send response including stats and client location
        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            data: {
                stats: clientStats,
                location,
            },
        });
    }
);