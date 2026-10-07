import mongoose from "mongoose";
import { syncPaymentIndexes } from "../features/payment/payment.model.js";

export const connectDB = async (): Promise<void> => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gigflow';
        console.log('mongouri,', mongoUri)
        if (!mongoUri) {
            throw new Error("MONGO_URI is not defined");
        }

        if (mongoose.connection.readyState === 1) {
            console.log("📈 MongoDB is already connected");
            await syncPaymentIndexes();
            return;
        }

        await mongoose.connect(mongoUri);

        console.log("📈 Database connected successfully");
        await syncPaymentIndexes();
    } catch (error) {
        console.error("❌ Database connection failed:", error);
        throw error;
    }
};