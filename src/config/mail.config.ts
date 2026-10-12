
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// ============================================
// SMTP Configuration
// ============================================

const smtpHost = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";

const smtpPort = Number(
    process.env.SMTP_PORT?.trim() || 587
);

const smtpUser =
    process.env.SMTP_USER?.trim() ||
    process.env.EMAIL_USER?.trim();

const smtpPass = (
    process.env.SMTP_PASS ||
    process.env.EMAIL_PASS ||
    ""
)
    .trim()
    .replace(/\s+/g, "");

const isSecure = smtpPort === 465;

// Validate configuration at startup.
if (!smtpUser || !smtpPass) {
    throw new Error(
        "[Mail Service] SMTP credentials are missing. " +
        "Configure SMTP_USER/EMAIL_USER and SMTP_PASS/EMAIL_PASS."
    );
}

if (![465, 587].includes(smtpPort)) {
    throw new Error(
        "[Mail Service] Invalid SMTP_PORT. Use 465 or 587."
    );
}

// ============================================
// Nodemailer Transporter
// ============================================

export const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: isSecure,

    // Require STARTTLS when using port 587.
    requireTLS: smtpPort === 587,

    // Connection pooling.
    pool: true,
    maxConnections: 3,
    maxMessages: 100,

    // Keep TLS certificate validation enabled.
    // Do not set rejectUnauthorized: false.

    auth: {
        user: smtpUser,
        pass: smtpPass,
    },

    // Enable only temporarily when debugging.
    logger: process.env.SMTP_DEBUG === "true",
    debug: process.env.SMTP_DEBUG === "true",
});

// ============================================
// Sender Address
// ============================================

/**
 * Returns a standardized sender address.
 *
 * EMAIL_FROM should normally match the authenticated Gmail
 * address or another sender identity authorized by the provider.
 */
export const getFromAddress = (
    customName?: string
): string => {
    const appName =
        customName ||
        process.env.APP_NAME ||
        "GigFlow";

    const configuredFrom = process.env.EMAIL_FROM?.trim();

    const fromAddress = configuredFrom || smtpUser;

    // Support: GigFlow <sender@example.com>
    if (
        fromAddress.includes("<") &&
        fromAddress.includes(">")
    ) {
        return fromAddress;
    }

    // Escape quotes and backslashes in the display name.
    const safeAppName = appName
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

    return `"${safeAppName}" <${fromAddress}>`;
};

// ============================================
// SMTP Connection Verification
// ============================================

/**
 * Verifies SMTP connectivity and authentication.
 *
 * Important: verify() does not send an email and does not
 * guarantee delivery to any recipient's inbox.
 */
export const verifyMailConnection =
    async (): Promise<boolean> => {
        try {
            await transporter.verify();

            console.info(
                "[Mail Service] SMTP connection verified.",
                {
                    host: smtpHost,
                    port: smtpPort,
                    secure: isSecure,
                    user: smtpUser,
                }
            );

            return true;
        } catch (error: unknown) {
            const err = error as Error & {
                code?: string;
                command?: string;
                responseCode?: number;
                response?: string;
            };

            console.error(
                "[Mail Service] SMTP verification failed:",
                {
                    message: err.message,
                    code: err.code,
                    command: err.command,
                    responseCode: err.responseCode,
                    response: err.response,
                }
            );

            return false;
        }
    };

// ============================================
// Graceful Shutdown
// ============================================

/**
 * Close pooled SMTP connections when the application shuts down.
 */
export const closeMailTransporter = (): void => {
    transporter.close();
};
