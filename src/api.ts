import dotenv from "dotenv";
dotenv.config();

import type { Request, Response } from "express";

import app from "./app.js";
import { connectDB } from "./config/database.config.js";

const handler = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        await connectDB();

        app(req, res);
    } catch (error) {
        console.error("❌ API Error:", error);

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: "Internal Server Error",
            });
        }
    }
};

export default handler;