import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const smtpHost = process.env.SMTP_HOST?.trim();
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT.trim(), 10) : 587;
const smtpUser = process.env.SMTP_USER?.trim() || process.env.EMAIL_USER?.trim();
const smtpPass = process.env.SMTP_PASS?.trim() || process.env.EMAIL_PASS?.trim();

// Port security: port 465 uses SSL/TLS (secure: true); ports 587 and 2525 use STARTTLS (secure: false)
const isSecure = smtpPort === 465;

// Base transporter configuration with pooling and cloud TLS safeguards
const transporterOptions: nodemailer.TransportOptions | any = {
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    tls: {
        rejectUnauthorized: false, // Prevents self-signed/proxy SSL handshake drops on cloud hosts
    },
    auth: {
        user: smtpUser,
        pass: smtpPass,
    },
};

if (smtpHost) {
    transporterOptions.host = smtpHost;
    transporterOptions.port = smtpPort;
    transporterOptions.secure = isSecure;
} else {
    // Fallback: Default to Gmail service if no custom SMTP host is set
    transporterOptions.service = "gmail";
}

export const transporter = nodemailer.createTransport(transporterOptions);

/**
 * Standardizes the "From" header across all outgoing emails.
 * Mismatched or malformed From addresses trigger DMARC/SPF/DKIM spoofing
 * blocks on external providers (Google, Yahoo, Outlook, custom corporate mail).
 */
export const getFromAddress = (customName?: string): string => {
    const appName = customName || process.env.APP_NAME || "GigFlow";

    if (process.env.EMAIL_FROM && process.env.EMAIL_FROM.trim() !== "") {
        const fromEnv = process.env.EMAIL_FROM.trim();
        if (fromEnv.includes("<") && fromEnv.includes(">")) {
            return fromEnv;
        }
        return `"${appName}" <${fromEnv}>`;
    }

    const fallbackEmail = smtpUser || "noreply@gigflow.com";
    return `"${appName}" <${fallbackEmail}>`;
};

/**
 * Startup diagnostic health check verifying SMTP connectivity and authentication.
 */
export const verifyMailConnection = async (): Promise<boolean> => {
    try {
        await transporter.verify();
        const transportInfo = smtpHost ? `${smtpHost}:${smtpPort} (secure: ${isSecure})` : "Gmail Service";
        console.log(`📧 [Mail Service] SMTP connection established & verified successfully -> ${transportInfo}`);
        return true;
    } catch (error: any) {
        console.error("❌ [Mail Service Error] SMTP connection verification failed:", {
            message: error?.message,
            code: error?.code,
            command: error?.command,
            response: error?.response,
        });
        return false;
    }
};
