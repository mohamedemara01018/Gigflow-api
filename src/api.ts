import dotenv from "dotenv";
dotenv.config();

import { createServer } from "node:http";
import app from "./app.js";
import { connectDB } from "./config/database.config.js";
import { initializeSocket } from "./socket.js";

await connectDB();

const server = createServer(app);

initializeSocket(server);

export default server;
