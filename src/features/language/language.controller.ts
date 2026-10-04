import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { statusText } from "../../utils/enums.utils.js";
import { Language } from "./language.model.js";

// ==========================================
// 1. GET ALL LANGUAGES (Optionally by Profile)
// ==========================================
export const getAllLanguages = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const profileId = req.query.profileId as string | undefined;

        const languages = await Language.find({ profile: profileId }).populate("profile", "title user");

        res.status(StatusCodes.OK).json({
            message: 'languages returned successfully',
            data: {
                languages,
            },
        });
    }
);

// ==========================================
// 2. CREATE LANGUAGE
// ==========================================
export const createLanguage = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { profile, name, level } = req.body;

        if (!profile || !name || !level) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "profile, name, and level fields are required",
                    statusText: statusText.FAIL,
                })
            );
        }

        const newLanguage = await Language.create({
            profile,
            name,
            level,
        });

        res.status(StatusCodes.CREATED).json({
            message: "Language added successfully",
            data: {
                language: newLanguage,
            },
        });
    }
);

// ==========================================
// 3. EDIT LANGUAGE
// ==========================================
export const editLanguage = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const body = req.body;

        if (!body || Object.keys(body).length === 0) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Request body cannot be empty",
                    statusText: statusText.FAIL,
                })
            );
        }

        const updatedLanguage = await Language.findByIdAndUpdate(
            id,
            { $set: body },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!updatedLanguage) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Language entry not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            message: "Language updated successfully",
            data: {
                language: updatedLanguage,
            },
        });
    }
);

// ==========================================
// 4. DELETE LANGUAGE
// ==========================================
export const deleteLanguage = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const deletedLanguage = await Language.findByIdAndDelete(id);

        if (!deletedLanguage) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Language entry not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Language deleted successfully",
            data: null,
        });
    }
);