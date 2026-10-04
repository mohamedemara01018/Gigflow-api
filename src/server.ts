import dotenv from "dotenv";
dotenv.config();

import http from "http";

import app from "./app.js";
import { connectDB } from "./config/database.config.js";
import { initializeSocket } from "./socket.js";

const PORT = Number(process.env.PORT) || 5000;

const startServer = async (): Promise<void> => {
    try {
        await connectDB();

        const server = http.createServer(app);

        initializeSocket(server);

        server.listen(PORT, () => {
            console.log("");
            console.log("====================================");
            console.log("🚀 Gigflow API Server");
            console.log("====================================");
            console.log(`🌐 API: http://localhost:${PORT}`);
            console.log(`🔌 Socket.IO: http://localhost:${PORT}`);
            console.log(
                `🌍 Environment: ${process.env.NODE_ENV || "development"}`
            );
            console.log("====================================");
            console.log("");
        });

        server.on("error", (error) => {
            console.error("❌ HTTP Server Error:", error);
        });
    } catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
};

/* =========================
   Process Errors
========================= */

process.on("unhandledRejection", (reason) => {
    console.error("❌ Unhandled Rejection:", reason);
    process.exit(1);
});

process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
    process.exit(1);
});

startServer();