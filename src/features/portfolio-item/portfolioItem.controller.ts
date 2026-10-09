import 'multer';
import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { cloudinaryFolderPath, PortfolioProjectStatus, statusText } from "../../utils/enums.utils.js";
import { destroyImageFromCloudinary, ICloudinaryProbs, replaceImageFromCloudinary, uploadImageToCloudinary } from "../../utils/cloudinary.utils.js";
import { PortfolioItem } from "./portfolioItem.model.js";

// ==========================================
// 1. GET ALL PORTFOLIO ITEMS (With Filters & Pagination)
// ==========================================
export const getAllPortfolioItems = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const {
            freelancer,
            technology,
            featured,
            status,
            page = 1,
            limit = 10,
        } = req.query;

        const filter: Record<string, any> = {};

        // By default, only serve published projects unless explicitly requested
        filter.status = status || PortfolioProjectStatus.PUBLISHED;

        if (freelancer) filter.freelancer = freelancer;
        if (technology) filter.technologies = technology;
        if (featured !== undefined) filter.featured = featured === "true";

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));
        const skip = (pageNum - 1) * limitNum;

        const [portfolioItems, totalItems] = await Promise.all([
            PortfolioItem.find(filter)
                .populate("freelancer", "firstName lastName avatar email title")
                .populate("technologies", "name category")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            PortfolioItem.countDocuments(filter),
        ]);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Portfolio items fetched successfully",
            data: {
                totalItems,
                currentPage: pageNum,
                totalPages: Math.ceil(totalItems / limitNum),
                portfolioItems,
            },
        });
    }
);

// ==========================================
// 2. GET SINGLE PORTFOLIO ITEM BY ID (Auto-increments views)
// ==========================================
export const getPortfolioItemById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        // Atomically increment the view counter when retrieved
        const portfolioItem = await PortfolioItem.findByIdAndUpdate(
            id,
            { $inc: { views: 1 } },
            { new: true }
        )
            .populate("freelancer", "firstName lastName avatar email title bio")
            .populate("technologies", "name category");

        if (!portfolioItem) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Portfolio item not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Portfolio item details fetched successfully",
            data: { portfolioItem },
        });
    }
);

// ==========================================
// 3. CREATE PORTFOLIO ITEM
// ==========================================
export const createPortfolioItem = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const {
            freelancer,
            title,
            description,
            technologies,
            projectUrl,
            githubUrl,
            figmaUrl,
            role,
            completedAt,
            status,
            featured,
        } = req.body;

        // 1. Basic field validations
        if (!freelancer || !title || !description) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "freelancer, title, and description are required fields",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Access uploaded files grouped by field name
        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

        if (!files || !files["thumbnail"] || files["thumbnail"].length === 0) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "A thumbnail image is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 2. Upload Thumbnail to Cloudinary
        const thumbnailFile = files["thumbnail"][0];
        const fileName = `image-${Date.now()}`
        const uploadedThumbnail = await uploadImageToCloudinary(thumbnailFile.buffer, cloudinaryFolderPath.IMAGE, fileName) as ICloudinaryProbs;

        // 3. Upload Gallery Images (if provided)
        const galleryImageUrls: { image: string, publicId: string }[] = [];
        if (files["images"] && files["images"].length > 0) {
            const uploadPromises = files["images"].map((file) => {
                const fileName = `image-${Date.now()}`
                return uploadImageToCloudinary(file.buffer, cloudinaryFolderPath.IMAGE, fileName)
            });
            const uploadResults = await Promise.all(uploadPromises) as ICloudinaryProbs[];
            galleryImageUrls.push(...uploadResults.map((result: ICloudinaryProbs) => {
                return { image: result.secure_url, publicId: result.public_id }
            }));
        }

        // 4. Parse JSON array if technology IDs are passed as a JSON string via form-data
        let parsedTechnologies = technologies;
        if (typeof technologies === "string") {
            try {
                parsedTechnologies = JSON.parse(technologies);
            } catch {
                parsedTechnologies = [technologies];
            }
        }

        // 5. Create Portfolio Item in Database
        const newPortfolioItem = await PortfolioItem.create({
            freelancer,
            title,
            description,
            thumbnail: { image: uploadedThumbnail.secure_url, publicId: uploadedThumbnail.public_id },
            images: galleryImageUrls,
            technologies: parsedTechnologies || [],
            projectUrl: projectUrl || null,
            githubUrl: githubUrl || null,
            figmaUrl: figmaUrl || null,
            role: role || null,
            completedAt: completedAt || null,
            status: status || PortfolioProjectStatus.PUBLISHED,
            featured: featured === "true" || featured === true,
        });

        await newPortfolioItem.populate([
            { path: "freelancer", select: "firstName lastName avatar" },
            { path: "technologies", select: "name category" },
        ]);

        res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: "Portfolio item created successfully",
            data: { portfolioItem: newPortfolioItem },
        });
    }
);

// ==========================================
// 4. UPDATE PORTFOLIO ITEM
// ==========================================
export const editPortfolioItem = asyncWrapper(
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

        const updatedPortfolioItem = await PortfolioItem.findByIdAndUpdate(
            id,
            { $set: body },
            {
                new: true,
                runValidators: true,
            }
        )
            .populate("freelancer", "firstName lastName avatar")
            .populate("technologies", "name category");

        if (!updatedPortfolioItem) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Portfolio item not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Portfolio item updated successfully",
            data: { portfolioItem: updatedPortfolioItem },
        });
    }
);



// ==========================================
// 5. DELETE PORTFOLIO ITEM
// ==========================================
export const deletePortfolioItem = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;


        const existingPortfolioItem = await PortfolioItem.findById(id);
        if (!existingPortfolioItem) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Portfolio item not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (existingPortfolioItem.thumbnail?.publicId) {
            await destroyImageFromCloudinary(existingPortfolioItem.thumbnail?.publicId);
        }

        if (existingPortfolioItem.images) {
            existingPortfolioItem.images.map((img) => {
                destroyImageFromCloudinary(img.publicId!)
            })
        }
        const deletedPortfolioItem = await PortfolioItem.findByIdAndDelete(id);

        if (!deletedPortfolioItem) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Portfolio item not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Portfolio item deleted successfully",
            data: null,
        });
    }
);


// ==========================================
// . Thumbnail
// ==========================================
export const addThumbnail = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const existingPortfolioItem = await PortfolioItem.findById(id);
        if (!existingPortfolioItem) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Portfolio item not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

        if (!files || !files["thumbnail"] || files["thumbnail"].length === 0) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "A thumbnail image is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        const thumbnailFile = files['thumbnail'][0];
        const fileName = `image-${Date.now()}`
        const result = await uploadImageToCloudinary(thumbnailFile.buffer, cloudinaryFolderPath.IMAGE, fileName) as ICloudinaryProbs

        const editedPortfolioItem = await PortfolioItem.findByIdAndUpdate(id, {
            thumbnail: { image: result.secure_url, publicId: result.public_id }
        }, { new: true })

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Thumbnail item changed successfully",
            data: { portfolioItem: editedPortfolioItem },
        });

    }
)
export const changeThumbnail = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { publicId } = req.body
        const { id } = req.params;

        const existingPortfolioItem = await PortfolioItem.findById(id);
        if (!existingPortfolioItem) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Portfolio item not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (!publicId) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Request body cannot be empty",
                    statusText: statusText.FAIL,
                })
            );
        }

        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

        if (!files || !files["thumbnail"] || files["thumbnail"].length === 0) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "A thumbnail image is required",
                    statusText: statusText.FAIL,
                })
            );
        }

        const thumbnailFile = files['thumbnail'][0];
        let result;
        if (existingPortfolioItem.thumbnail?.publicId && existingPortfolioItem.thumbnail?.publicId == publicId) {
            result = await replaceImageFromCloudinary(thumbnailFile.buffer, publicId) as ICloudinaryProbs
        } else {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "thumbnail doesn't exist",
                    statusText: statusText.FAIL,
                })
            );
        }

        const editedPortfolioItem = await PortfolioItem.findByIdAndUpdate(id, {
            thumbnail: { image: result.secure_url, publicId: result.public_id }
        }, { new: true })

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Thumbnail item changed successfully",
            data: { portfolioItem: editedPortfolioItem },
        });
    }
)
export const deleteThumbnail = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { publicId } = req.body
        const { id } = req.params;

        const existingPortfolioItem = await PortfolioItem.findById(id);
        if (!existingPortfolioItem) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Portfolio item not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (!publicId) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Request body cannot be empty",
                    statusText: statusText.FAIL,
                })
            );
        }
        if (existingPortfolioItem.thumbnail?.publicId && existingPortfolioItem.thumbnail?.publicId == publicId) {
            await destroyImageFromCloudinary(publicId);
        } else {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "thumbnail doesn't exist",
                    statusText: statusText.FAIL,
                })
            );
        }

        const editedPortfolioItem = await PortfolioItem.findByIdAndUpdate(id, {
            thumbnail: { image: null, publicId: null }
        }, { new: true })

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Thumbnail item deleted successfully",
            data: { portfolioItem: editedPortfolioItem },
        });

    }
)

// ==========================================
// . Image
// ==========================================

export const addImage = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const existingPortfolioItem = await PortfolioItem.findById(id);
        if (!existingPortfolioItem) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Portfolio item not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
        console.log('files', files)
        if (!files || !files['images'] || Array(files["images"]).length === 0) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "A images  is required",
                    statusText: statusText.FAIL,
                })
            );
        }
        const imageCount = Number(existingPortfolioItem.images.length) + Number(Array(files["images"]).length);
        if (imageCount > 10) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "number of image mustn't exceed ten image",
                    statusText: statusText.FAIL,
                })
            );
        }

        const uploadPromises = files && Array(files["images"]).length > 0 && files['images'].map((file: Express.Multer.File) => {
            const fileName = `image-${Date.now()}`
            return uploadImageToCloudinary(file.buffer, cloudinaryFolderPath.IMAGE, fileName)
        })

        const uploadResults = uploadPromises ? await Promise.all(uploadPromises) as ICloudinaryProbs[] : []
        const imgs = uploadResults.map((img) => {
            return {
                image: img.secure_url,
                publicId: img.public_id
            }
        })

        const galleryImageUrls = [...existingPortfolioItem.images, ...imgs]

        const editedPortfolioItem = await PortfolioItem.findByIdAndUpdate(id, {
            images: galleryImageUrls
        }, { new: true })

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "image(s) added successfully",
            data: { portfolioItem: editedPortfolioItem },
        });
    }
)

export const deleteImage = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { publicId } = req.body
        const { id } = req.params;

        const existingPortfolioItem = await PortfolioItem.findById(id);
        if (!existingPortfolioItem) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Portfolio item not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (!publicId) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Request body cannot be empty",
                    statusText: statusText.FAIL,
                })
            );
        }
        let publicIdExist = false;
        existingPortfolioItem.images.map((img) => {
            if (img.publicId == publicId) {
                publicIdExist = true;
                return
            }
        })
        if (publicIdExist) {
            await destroyImageFromCloudinary(publicId);
        } else {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "image doesn't exist",
                    statusText: statusText.FAIL,
                })
            );
        }
        const galleryImageUrls = existingPortfolioItem.images.filter((img) => {
            return img.publicId != publicId
        })
        const editedPortfolioItem = await PortfolioItem.findByIdAndUpdate(id, {
            images: galleryImageUrls
        }, { new: true })

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "image deleted successfully",
            data: { portfolioItem: editedPortfolioItem },
        });
    }
)