import mongoose from "mongoose";
import { syncPaymentIndexes } from "../features/payment/payment.model.js";

let isConnected = false;
let connectingPromise: Promise<typeof mongoose> | null = null;

export const connectDB = async (): Promise<void> => {
    // 1. If already connected, return immediately
    if (mongoose.connection.readyState === 1) {
        return;
    }

    // 2. If already connecting in current serverless container, wait for promise
    if (connectingPromise) {
        await connectingPromise;
        return;
    }

    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gigflow";

    try {
        connectingPromise = mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10,
        });

        await connectingPromise;

        if (!isConnected) {
            isConnected = true;
            console.log("📈 Database connected successfully");

            // Sync indexes once upon fresh connect without blocking
            syncPaymentIndexes().catch((indexError) => {
                console.warn("⚠️ Failed to synchronize payment indexes:", indexError);
            });
        }
    } catch (error) {
        connectingPromise = null;
        console.error("❌ Database connection failed:", error);
        throw error;
    }
};