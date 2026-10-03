// src/app.ts

import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { StatusCodes } from 'http-status-codes'
import { globalErrorHandler } from "./middleware/globalErrorHandler.middleware";
import authRoutes from './features/auth/auth.routes';
import userRoutes from './features/user/user.routes';
import profileRoutes from './features/profile/profile.route'
import languageRoutes from './features/language/language.route'
import certificationRoutes from './features/certification/certification.route'
import educationRoutes from './features/education/education.route'
import employmentHistoryRoutes from './features/employment-history/employmentHistory.route'
import categoryRoutes from './features/category/category.route'
import skillRoutes from './features/skill/skill.route'
import profileSkillRoutes from './features/profile-skill/profileSkill.route'
import jobSkillRoutes from './features/job-skill/jobSkill.routes'
import jobRoutes from './features/job/job.route'
import proposalRoutes from './features/proposal/proposal.route'
import saveJobRoutes from './features/save-job/savedJob.route'
import attachmentRoutes from './features/attachment/attachment.route'
import portfolioItemRoutes from './features/portfolio-item/portfolioItem.route'
import verificationRoutes from './features/verification-request/verificationRequest.route'
import countryRoutes from './features/country/country.route';
import cityRoutes from './features/city/city.route'
import notificationRoutes from './features/notification/notification.routes'
import clientStatsRoutes from './features/clientStats/clientStats.route';
import conversationRoutes from './features/conversation/conversation.routes'
import messageRoutes from './features/message/message.routes'
import contractRoutes from './features/contract/contract.routes';
import milestoneRoutes from './features/milestone/milestone.routes'
import paymentMethodRoutes from './features/payment-method/paymentMethod.route'

const app: Application = express();

/* ===========================
   Global Middlewares
=========================== */

// Security
app.use(helmet());

// CORS
app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        credentials: true,
    })
);

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: {
        success: false,
        message: "Too many requests. Please try again later.",
    },
});

// app.use("/api", limiter);

// Body Parsers
app.use(
    express.json({
        limit: "10mb",
        verify: (req: any, _res, buf) => {
            req.rawBody = buf;
        },
    })
);
app.use(express.urlencoded({ extended: true }));

// Cookies
app.use(cookieParser());

// Compression
app.use(compression());

// Logger
if (process.env.NODE_ENV !== "production") {
    app.use(morgan("dev"));
}

/* ===========================
   Health Check
=========================== */

app.get("/", (_req: Request, res: Response) => {
    res.status(StatusCodes.OK).json({
        success: true,
        message: "Freelancing API is running 🚀",
    });
});

/* ===========================
   API Routes
=========================== */


app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/language", languageRoutes);
app.use("/api/certification", certificationRoutes);
app.use("/api/education", educationRoutes);
app.use("/api/employment-histroy", employmentHistoryRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/skill", skillRoutes);
app.use("/api/profile-skill", profileSkillRoutes);
app.use("/api/job-skill", jobSkillRoutes);
app.use("/api/job", jobRoutes);
app.use("/api/proposal", proposalRoutes);
app.use("/api/save-job", saveJobRoutes);
app.use("/api/attachment", attachmentRoutes);
app.use('/api/portfolio-item', portfolioItemRoutes);
app.use('/api/verifiction', verificationRoutes);
app.use('/api/country', countryRoutes);
app.use('/api/city', cityRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/client-stats', clientStatsRoutes);
app.use('/api/conversation', conversationRoutes);
app.use('/api/message', messageRoutes);
app.use('/api/contract', contractRoutes);
app.use('/api/milestone', milestoneRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/stripe', paymentMethodRoutes);

/* ===========================
    404 Handler
=========================== */

app.all("/*splat", (req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
    });
});

/* ===========================
    Global Error Handler
=========================== */

app.use(globalErrorHandler);

export default app;