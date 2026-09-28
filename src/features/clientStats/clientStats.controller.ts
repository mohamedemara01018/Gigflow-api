import { NextFunction, Request, Response } from "express";
import asyncWrapper from "../../utils/asyncWrapper.utils";
import { Job } from "../job/job.model";
import { ClientStats } from "./clientStats.model";
import { appError } from "../../utils/appError.utils";
import { StatusCodes } from "http-status-codes";
import { statusText } from "../../utils/enums.utils";
import { User } from "../user/user.model";

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
            .populate("country", "name code") // Adjust fields based on your Country schema
            .populate("city", "name")         // Adjust fields based on your City schema
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

        // 2. Fetch job metrics concurrently
        const [totalJobsPosted, totalJobsHired] = await Promise.all([
            Job.countDocuments({ client: clientId }),
            Job.countDocuments({ client: clientId, hiresCount: { $gt: 0 } }),
        ]);

        // 3. Calculate Hire Rate percentage (0 - 100)
        const hireRate =
            totalJobsPosted > 0
                ? Math.round((totalJobsHired / totalJobsPosted) * 100)
                : 0;

        // 4. Upsert ClientStats
        const clientStats = await ClientStats.findOneAndUpdate(
            { client: clientId },
            {
                $set: {
                    totalJobsPosted,
                    totalJobsHired,
                    hireRate,
                },
                $setOnInsert: {
                    paymentVerified: false,
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