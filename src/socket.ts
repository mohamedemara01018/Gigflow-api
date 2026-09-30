// server/src/socket.ts
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

let io: Server;

export const initializeSocket = (server: HttpServer) => {
    io = new Server(server, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:3000",
            credentials: true,
        },
    });

    io.on("connection", (socket: Socket) => {
        console.log("Socket connected:", socket.id);

        // User joins their personal room
        socket.on("join", (userId: string) => {
            const room = `user:${userId}`;
            socket.join(room);
            console.log(`User ${userId} joined room ${room}`);
        });

        // User joins a specific conversation room
        socket.on("join_conversation", ({ conversationId }: { conversationId: string }) => {
            const room = `conversation:${conversationId}`;
            socket.join(room);
            console.log(`Socket ${socket.id} joined conversation room ${room}`);
        });

        // User leaves a specific conversation room
        socket.on("leave_conversation", ({ conversationId }: { conversationId: string }) => {
            const room = `conversation:${conversationId}`;
            socket.leave(room);
            console.log(`Socket ${socket.id} left conversation room ${room}`);
        });

        // Typing status: start
        socket.on(
            "typing_start",
            ({ conversationId, userId }: { conversationId: string; userId: string }) => {
                const room = `conversation:${conversationId}`;
                socket.to(room).emit("user_typing", { conversationId, userId, isTyping: true });
            }
        );

        // Typing status: stop
        socket.on(
            "typing_stop",
            ({ conversationId, userId }: { conversationId: string; userId: string }) => {
                const room = `conversation:${conversationId}`;
                socket.to(room).emit("user_typing", { conversationId, userId, isTyping: false });
            }
        );

        socket.on("disconnect", () => {
            console.log("Socket disconnected:", socket.id);
        });
    });

    return io;
};

export const getIO = (): Server => {
    if (!io) {
        throw new Error("Socket.IO has not been initialized");
    }
    return io;
};