import { Readable } from "stream";
import cloudinary from "../config/cloudinary.config.js";

export interface ICloudinaryProbs {
    asset_id: string;
    public_id: string;
    version: number;
    version_id: string;
    signature: string;
    width: number;
    height: number;
    format: string;
    resource_type: "image" | "video" | "raw" | "auto";
    created_at: string;
    tags: string[];
    bytes: number;
    type: "upload" | string;
    etag: string;
    placeholder: boolean;
    url: string;
    secure_url: string;
    asset_folder: string;
    display_name: string;
    original_filename: string;
    api_key: string;
}

export const uploadImageToCloudinary = async (
    buffer: Buffer,
    folder: string,
    fileName: string,
    resourceType: "image" | "video" | "raw" | "auto" = "auto"
): Promise<ICloudinaryProbs> => {
    return new Promise((resolve, reject) => {
        const options = {
            public_id: fileName,
            folder,
            overwrite: true,
            resource_type: resourceType, // Dynamically handle PDFs (raw) and Images
        };

        const stream = cloudinary.uploader.upload_stream(options, (err, res) => {
            if (err) return reject(err);
            resolve(res as unknown as ICloudinaryProbs);
        });

        Readable.from(buffer).pipe(stream);
    });
};

export const replaceImageFromCloudinary = async (
    buffer: Buffer,
    public_id: string,
    resourceType: "image" | "video" | "raw" | "auto" = "image"
): Promise<ICloudinaryProbs> => {
    return new Promise((resolve, reject) => {
        if (!public_id) throw new Error("You must provide public_id to complete the process");

        const options = {
            public_id,
            overwrite: true,
            resource_type: resourceType,
        };

        const stream = cloudinary.uploader.upload_stream(options, (err, res) => {
            if (err) return reject(err);
            resolve(res as unknown as ICloudinaryProbs);
        });

        Readable.from(buffer).pipe(stream);
    });
};

export const destroyImageFromCloudinary = async (
    public_id: string,
    resourceType: "image" | "video" | "raw" | "auto" = "image"
) => {
    return new Promise((resolve, reject) => {
        if (!public_id) throw new Error("You must provide public_id to complete the process");

        cloudinary.uploader.destroy(public_id, { resource_type: resourceType }, (err, res) => {
            if (err) return reject(err);
            resolve(res);
        });
    });
};