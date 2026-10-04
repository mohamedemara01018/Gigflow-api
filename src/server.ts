import "./types/express/index.js";
import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./config/database.config.js";
import { initializeSocket } from "./socket.js";
import http from "http";

const PORT = process.env.PORT || 5000;

const startServer = async (): Promise<void> => {
    try {
        await connectDB();

        const server = http.createServer(app);

        initializeSocket(server);

        server.listen(PORT, () => {
            console.log(`🚀 Server is running on http://localhost:${PORT}`);
            console.log(`🔌 Socket.IO is running on http://localhost:${PORT}`);
            console.log(
                `🌍 Environment: ${process.env.NODE_ENV || "development"}`
            );
        });
    } catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
};

startServer();

process.on("unhandledRejection", (reason) => {
    console.error("❌ Unhandled Rejection:", reason);
    process.exit(1);
});

process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
    process.exit(1);
});