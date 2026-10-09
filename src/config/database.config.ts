import mongoose from "mongoose";
import { syncPaymentIndexes } from "../features/payment/payment.model.js";

export const connectDB = async (): Promise<void> => {
    try {
        const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gigflow";
        console.log("MongoDB URI:", mongoUri);

        if (mongoose.connection.readyState === 1) {
            console.log("📈 MongoDB is already connected");
            return;
        }

        // Add explicit connection options and timeout
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of default 10s hanging
        });

        console.log("📈 Database connected successfully");

        // Execute index sync safely without blocking application startup
        try {
            await syncPaymentIndexes();
            console.log("⚡ Payment indexes synchronized successfully");
        } catch (indexError) {
            console.warn("⚠️ Failed to synchronize payment indexes:", indexError);
        }
    } catch (error) {
        console.error("❌ Database connection failed:", error);
        throw error;
    }
};