import dotenv from "dotenv";
dotenv.config();

import { createServer } from "node:http";
import app from "./app.js";
import { connectDB } from "./config/database.config.js";
import { initializeSocket } from "./socket.js";
import { verifyMailConnection } from "./config/mail.config.js";

await connectDB();

const server = createServer(app);

initializeSocket(server);

verifyMailConnection().catch((err) => {
    console.error("Mail verification error on startup:", err);
});

export default server;
