// server/src/socket.ts
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { User } from "./features/user/user.model.js";
import { Conversation } from "./features/conversation/conversation.model.js";

let io: Server;

// In-memory runtime presence maps
// userId -> active socket count
const userSocketCount = new Map<string, number>();

// socketId -> userId for disconnect cleanup
const socketUserMap = new Map<string, string>();

/**
 * Check if a user is currently online (has at least 1 active socket connection)
 */
export const isUserOnline = (userId: string): boolean => {
    return (userSocketCount.get(userId) || 0) > 0;
};

/**
 * Get a list of all currently online user IDs
 */
export const getOnlineUsersList = (): string[] => {
    const onlineList: string[] = [];
    userSocketCount.forEach((count, uid) => {
        if (count > 0) onlineList.push(uid);
    });
    return onlineList;
};

/**
 * Get online status map for specific user IDs
 */
export const getPresenceForUsers = (userIds: string[]): Record<string, boolean> => {
    const presence: Record<string, boolean> = {};
    for (const uid of userIds) {
        if (uid) {
            presence[uid] = isUserOnline(uid);
        }
    }
    return presence;
};

const parseCookies = (cookieHeader?: string): Record<string, string> => {
    if (!cookieHeader) return {};
    return cookieHeader.split(";").reduce((acc, c) => {
        const [key, ...vals] = c.trim().split("=");
        if (key && vals.length > 0) {
            acc[key] = decodeURIComponent(vals.join("="));
        }
        return acc;
    }, {} as Record<string, string>);
};

export const initializeSocket = (server: HttpServer) => {
    io = new Server(server, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:3000",
            credentials: true,
        },
    });

    // Authentication Middleware: Verify JWT from cookie or handshake auth
    io.use(async (socket: Socket, next) => {
        try {
            const cookieHeader = socket.handshake.headers.cookie;
            const cookies = parseCookies(cookieHeader);
            const token = socket.handshake.auth?.token || cookies.token;

            if (token) {
                const decoded = jwt.verify(
                    token,
                    String(process.env.JWT_TOKEN_SECRET_KEY)
                ) as { email: string; role: string };

                if (decoded?.email) {
                    const user = await User.findOne({ email: decoded.email }).select(
                        "_id email role firstName lastName"
                    );
                    if (user) {
                        socket.data.userId = user._id.toString();
                        socket.data.user = user;
                    }
                }
            }
            next();
        } catch (error) {
            // Allow connection to proceed; unauthenticated sockets can identify via verified routes
            next();
        }
    });

    io.on("connection", (socket: Socket) => {
        console.log("Socket connected:", socket.id);

        const handleUserOnline = (userId: string) => {
            if (!userId) return;

            socket.data.userId = userId;
            socketUserMap.set(socket.id, userId);

            const currentCount = userSocketCount.get(userId) || 0;
            const newCount = currentCount + 1;
            userSocketCount.set(userId, newCount);

            // Join personal user room
            socket.join(`user:${userId}`);

            // If first active socket connection (0 -> 1), user transitioned to ONLINE
            if (currentCount === 0) {
                console.log(`[Presence] User ${userId} is now ONLINE`);
                io.emit("user_online", { userId });
            }

            // Emit current list of online users to the newly connected socket
            socket.emit("presence_state", {
                onlineUserIds: getOnlineUsersList(),
            });
        };

        // If authenticated via handshake JWT middleware
        if (socket.data.userId) {
            handleUserOnline(socket.data.userId);
        }

        // Handle user room join & presence registration
        socket.on("join", (userId: string) => {
            const verifiedUserId = socket.data.userId || userId;
            if (verifiedUserId) {
                handleUserOnline(verifiedUserId);
                console.log(`User ${verifiedUserId} joined personal room user:${verifiedUserId}`);
            }
        });

        // Request presence for specific users
        socket.on(
            "check_presence",
            ({ userIds }: { userIds: string[] }, callback?: (res: any) => void) => {
                const presence = getPresenceForUsers(userIds || []);
                if (callback && typeof callback === "function") {
                    callback({ presence });
                } else {
                    socket.emit("presence_response", { presence });
                }
            }
        );

        // User joins a specific conversation room
        socket.on(
            "join_conversation",
            async ({ conversationId }: { conversationId: string }) => {
                const room = `conversation:${conversationId}`;
                socket.join(room);
                console.log(`Socket ${socket.id} joined conversation room ${room}`);

                // Send current presence of conversation participants immediately
                try {
                    const conversation = await Conversation.findById(conversationId).select(
                        "client freelancer"
                    );
                    if (conversation) {
                        const clientUid = conversation.client?.toString();
                        const freelancerUid = conversation.freelancer?.toString();
                        const presence: Record<string, boolean> = {};

                        if (clientUid) presence[clientUid] = isUserOnline(clientUid);
                        if (freelancerUid) presence[freelancerUid] = isUserOnline(freelancerUid);

                        socket.emit("conversation_presence", {
                            conversationId,
                            presence,
                        });
                    }
                } catch (e) {
                    console.error("Failed to emit conversation presence:", e);
                }
            }
        );

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
            const userId = socketUserMap.get(socket.id) || socket.data.userId;
            socketUserMap.delete(socket.id);

            if (userId) {
                const currentCount = userSocketCount.get(userId) || 1;
                const newCount = Math.max(0, currentCount - 1);

                if (newCount === 0) {
                    userSocketCount.delete(userId);
                    console.log(`[Presence] User ${userId} is now OFFLINE (all connections closed)`);
                    io.emit("user_offline", { userId });
                } else {
                    userSocketCount.set(userId, newCount);
                    console.log(`[Presence] User ${userId} active sockets count decreased to ${newCount}`);
                }
            }
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