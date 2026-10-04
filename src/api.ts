import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./config/database.config.js";

const handler = async (req: any, res: any) => {
    try {
        await connectDB();

        return app(req, res);
    } catch (error) {
        console.error("❌ API Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

export default handler;