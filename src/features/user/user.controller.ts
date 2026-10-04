import type { NextFunction, Request, Response } from "express";
import { User } from "./user.model.js";
import { appError } from "../../utils/appError.utils.js";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { cloudinaryFolderPath, statusText } from "../../utils/enums.utils.js";
import { destroyImageFromCloudinary, ICloudinaryProbs, replaceImageFromCloudinary, uploadImageToCloudinary } from "../../utils/cloudinary.utils.js";

const getAllUser = asyncWrapper(
    async (req: Request, res: Response) => {
        const pageNumber = Math.max(Number(req.query.pageNumber) || 1, 1);
        const pageSize = Math.max(Number(req.query.pageSize) || 10, 1);
        const skip = (pageNumber - 1) * pageSize;

        const {
            search,
            role,
            isIdentityVerified,
            status,
        } = req.query;

        const filter: Record<string, any> = {};

        // Search
        if (search) {
            filter.$or = [
                { firstName: { $regex: search, $options: "i" } },
                { lastName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        // Role
        if (role) {
            filter.role = role;
        }

        // Identity verification
        if (isIdentityVerified !== undefined) {
            filter.isIdentityVerified =
                isIdentityVerified === "true";
        }

        // Status
        if (status) {
            filter.status = status;
        }

        // Total filtered users
        const totalUsers = await User.countDocuments(filter);

        // Users
        const users = await User.find(filter)
            .select("-password -token -resetToken")
            .populate("country")
            .populate("city")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageSize)
            .lean();

        res.status(200).json({
            message: "All users returned successfully",
            data: {
                users,
                pagination: {
                    pageNumber,
                    pageSize,
                    totalUsers,
                    totalPages: Math.ceil(
                        totalUsers / pageSize
                    ),
                },
            },
        });
    }
);

const getUserById = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    if (!id) {
        return next(appError({
            statusCode: 404,
            message: 'id not found',
            statusText: statusText.FAIL
        }));
    }

    const user = await User.findById(id)
        .populate("country")
        .populate("city");

    if (!user?.email) {
        return next(appError({
            statusCode: 404,
            message: 'user not found',
            statusText: statusText.FAIL
        }));
    }

    res.status(200).json({
        message: 'user founded',
        data: {
            user
        }
    });
});

const updateUser = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const { firstName, lastName, country, city, phone } = req.body;

    if (!firstName?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "First name is required.",
                statusText: statusText.FAIL,
            })
        );
    }

    if (!lastName?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Last name is required.",
                statusText: statusText.FAIL,
            })
        );
    }

    const updatedUser = await User.findOneAndUpdate(
        { email: String(req.currentUser?.email) },
        {
            firstName,
            lastName,
            country,
            phone,
            city,
        },
        {
            new: true,
            runValidators: true,
        }
    )
        .select("-password -token -resetToken")
        .populate("country")
        .populate("city");

    if (!updatedUser) {
        return next(
            appError({
                statusCode: 404,
                message: "User not found.",
                statusText: statusText.FAIL,
            })
        );
    }

    res.status(200).json({
        message: "Profile updated successfully.",
        data: { user: updatedUser },
    });
});

const changePassword = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Current password is required.",
                statusText: statusText.FAIL,
            })
        );
    }

    if (!newPassword?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "New password is required.",
                statusText: statusText.FAIL,
            })
        );
    }

    const currentUser = await User.findOne({
        email: req.currentUser?.email as string,
    });

    if (!currentUser) {
        return next(
            appError({
                statusCode: 404,
                message: "User not found.",
                statusText: statusText.FAIL,
            })
        );
    }

    const isPasswordCorrect = await bcrypt.compare(
        currentPassword,
        currentUser.password
    );

    if (!isPasswordCorrect) {
        return next(
            appError({
                statusCode: 400,
                message: "Current password is incorrect.",
                statusText: statusText.FAIL,
            })
        );
    }

    const isSamePassword = await bcrypt.compare(
        newPassword,
        currentUser.password
    );

    if (isSamePassword) {
        return next(
            appError({
                statusCode: 400,
                message: "New password must be different from the current password.",
                statusText: statusText.FAIL,
            })
        );
    }

    // hash password
    const salt = await bcrypt.genSalt(10);
    currentUser.password = await bcrypt.hash(newPassword, salt);

    await currentUser.save();

    res.clearCookie("token");

    res.status(200).json({
        message: "Password changed successfully. Please log in again.",
    });
});

const me = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.token;

    if (!token) {
        return next(appError({
            statusCode: 401,
            message: 'user not found',
            statusText: statusText.FAIL
        }));
    }

    const payload = jwt.verify(token, String(process.env.JWT_TOKEN_SECRET_KEY)) as { email: string };

    const email = payload?.email;
    const currentUser = await User.findOne({ email: String(email) })
        .select('-verifiedEmailCode -emailCodeExpiresAt -verifiedPhoneCode -phoneCodeExpiresAt -resetToken -resetTokenExpiresAt -refreshTokenVersion -deletedAt -password')
        .populate("country")
        .populate("city");

    res.status(200).json({
        message: 'user founded',
        data: {
            user: currentUser
        }
    });
});

const changeAvatar = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const token = req.cookies.token;
        const file = req.file;

        if (!token) {
            return next(appError({
                statusCode: 401,
                message: 'Unauthorized: Token missing',
                statusText: statusText.FAIL
            }));
        }

        if (!file) {
            return next(appError({
                statusCode: 400,
                message: 'Please upload an image file',
                statusText: statusText.FAIL
            }));
        }

        const payload = jwt.verify(
            token,
            String(process.env.JWT_TOKEN_SECRET_KEY)
        ) as { email: string };

        const currentUser = await User.findOne({ email: payload?.email });

        if (!currentUser) {
            return next(appError({
                statusCode: 404,
                message: 'User not found',
                statusText: statusText.FAIL
            }));
        }

        let uploadResult: ICloudinaryProbs;

        if (currentUser.avatar && currentUser.public_id) {
            uploadResult = await replaceImageFromCloudinary(
                file.buffer,
                currentUser.public_id
            ) as ICloudinaryProbs;
        } else {
            const fileName = `image-${Date.now()}`;
            uploadResult = await uploadImageToCloudinary(
                file.buffer,
                cloudinaryFolderPath.IMAGE,
                fileName
            ) as ICloudinaryProbs;
        }

        currentUser.avatar = uploadResult.secure_url;
        currentUser.public_id = uploadResult.public_id;
        await currentUser.save();

        return res.status(200).json({
            status: statusText.SUCCESS,
            data: {
                user: currentUser
            }
        });
    }
);

const removeAvatar = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const token = req.cookies.token;

        if (!token) {
            return next(appError({
                statusCode: 401,
                message: 'Unauthorized: Token missing',
                statusText: statusText.FAIL
            }));
        }

        const payload = jwt.verify(
            token,
            String(process.env.JWT_TOKEN_SECRET_KEY)
        ) as { email: string };

        const currentUser = await User.findOne({ email: payload?.email });

        if (!currentUser) {
            return next(appError({
                statusCode: 404,
                message: 'User not found',
                statusText: statusText.FAIL
            }));
        }

        // Check if the user actually has an avatar to delete
        if (!currentUser.public_id) {
            return next(appError({
                statusCode: 400,
                message: 'No profile image to remove',
                statusText: statusText.FAIL
            }));
        }

        // Delete the image from Cloudinary
        await destroyImageFromCloudinary(currentUser.public_id);

        // Clear image fields in the database
        currentUser.avatar = null;
        currentUser.public_id = null;
        await currentUser.save();

        return res.status(200).json({
            status: statusText.SUCCESS,
            message: 'Profile image removed successfully',
            data: {
                user: currentUser
            }
        });
    }
);

export {
    getAllUser,
    getUserById,
    updateUser,
    changePassword,
    me,
    changeAvatar,
    removeAvatar
};