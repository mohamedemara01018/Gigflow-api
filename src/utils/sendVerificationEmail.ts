import { transporter } from "../config/mail.config.js";

// ==========================================
// Types & Interfaces
// ==========================================

export interface AdminVerificationAlertProps {
    adminEmails: string[];
    user: {
        firstName?: string;
        lastName?: string;
        email: string;
    };
    documentType: string;
    submittedAt?: Date | string;
    requestId?: string;
}

export interface VerificationApprovedEmailProps {
    email: string;
    firstName?: string;
}

export interface VerificationRejectedEmailProps {
    email: string;
    firstName?: string;
    rejectionReason: string;
    notes?: string;
}

// Format Document Type nicely (e.g. "national_id" -> "National ID", "passport" -> "Passport")
function formatDocumentType(docType: string): string {
    if (!docType) return "Identification Document";
    return docType
        .split(/[-_]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

// Format submission date nicely
function formatSubmissionDate(date?: Date | string): string {
    const d = date ? new Date(date) : new Date();
    return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
    });
}

// ==========================================
// 1. ADMIN ALERT: New Verification Request
// ==========================================
export const sendNewVerificationRequestAdminAlert = async ({
    adminEmails,
    user,
    documentType,
    submittedAt,
    requestId,
}: AdminVerificationAlertProps): Promise<void> => {
    if (!adminEmails || adminEmails.length === 0) {
        console.warn("[Mail Service] No admin email addresses provided for verification alert.");
        return;
    }

    const appName = process.env.APP_NAME || "GigFlow";
    const frontendUrl = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");
    const adminReviewUrl = `${frontendUrl}/admin/verifications`;

    const userFullName = `${user.firstName?.trim() || ""} ${user.lastName?.trim() || ""}`.trim() || "User";
    const userEmail = user.email || "N/A";
    const formattedDocType = formatDocumentType(documentType);
    const formattedDate = formatSubmissionDate(submittedAt);

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Verification Request</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 16px;">
                <tr>
                    <td align="center">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; border-collapse: separate; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                            
                            <!-- Header / Badge -->
                            <tr>
                                <td style="padding: 40px 40px 0 40px; text-align: center;">
                                    <div style="display: inline-block; width: 52px; height: 52px; background-color: #eff6ff; border-radius: 14px; line-height: 52px; font-size: 24px; text-align: center;">
                                        🛡️
                                    </div>
                                    <h1 style="margin: 16px 0 6px 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
                                        New Verification Request
                                    </h1>
                                    <p style="margin: 0; font-size: 14px; color: #64748b;">
                                        Action required on the ${appName} Admin Dashboard
                                    </p>
                                </td>
                            </tr>

                            <!-- Content -->
                            <tr>
                                <td style="padding: 24px 40px; text-align: left;">
                                    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155;">
                                        Hello Admin,
                                    </p>
                                    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 24px; color: #475569;">
                                        A new identity verification request has been submitted by <strong style="color: #0f172a;">${userFullName}</strong> and is waiting for your review.
                                    </p>

                                    <!-- Request Details Box -->
                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
                                        <tr>
                                            <td style="padding: 16px 20px;">
                                                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                                                    <tr>
                                                        <td style="padding: 6px 0; font-size: 13px; color: #64748b; width: 140px;">Applicant Name:</td>
                                                        <td style="padding: 6px 0; font-size: 14px; font-weight: 600; color: #0f172a;">${userFullName}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Applicant Email:</td>
                                                        <td style="padding: 6px 0; font-size: 14px; color: #0f172a;">${userEmail}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Document Type:</td>
                                                        <td style="padding: 6px 0; font-size: 14px; font-weight: 600; color: #2563eb;">${formattedDocType}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Submitted At:</td>
                                                        <td style="padding: 6px 0; font-size: 13px; color: #334155;">${formattedDate}</td>
                                                    </tr>
                                                    ${
                                                        requestId
                                                            ? `<tr>
                                                        <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Request ID:</td>
                                                        <td style="padding: 6px 0; font-size: 12px; font-family: monospace; color: #64748b;">${requestId}</td>
                                                    </tr>`
                                                            : ""
                                                    }
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- CTA Button -->
                                    <div style="text-align: center; margin-bottom: 24px;">
                                        <a href="${adminReviewUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 13px 32px; border-radius: 10px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
                                            Review Verification Request
                                        </a>
                                    </div>

                                    <p style="margin: 0; font-size: 13px; line-height: 20px; color: #64748b; text-align: center;">
                                        Please log in to the admin panel to inspect uploaded documents and make a decision.
                                    </p>
                                </td>
                            </tr>

                            <!-- Divider -->
                            <tr>
                                <td style="padding: 0 40px;">
                                    <div style="border-top: 1px solid #f1f5f9; width: 100%;"></div>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="padding: 24px 40px 32px 40px; text-align: center;">
                                    <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 18px;">
                                        © ${new Date().getFullYear()} <strong>${appName}</strong> System Notification.
                                    </p>
                                </td>
                            </tr>

                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;

    const plainText = `[${appName} Admin Alert] New Identity Verification Request\n\n` +
        `Applicant: ${userFullName} (${userEmail})\n` +
        `Document Type: ${formattedDocType}\n` +
        `Submitted At: ${formattedDate}\n` +
        `${requestId ? `Request ID: ${requestId}\n` : ""}\n` +
        `Please review this request on the admin panel: ${adminReviewUrl}`;

    // Dispatch to all admins safely
    await Promise.allSettled(
        adminEmails.map(async (email) => {
            return transporter.sendMail({
                from: `"${appName}" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `[${appName}] New Identity Verification Request - ${userFullName}`,
                text: plainText,
                html: htmlContent,
            });
        })
    );

    console.log(`[Mail Service] Verification alert sent to ${adminEmails.length} admin(s).`);
};

// ==========================================
// 2. USER DECISION: Verification Approved
// ==========================================
export const sendVerificationApprovedEmail = async ({
    email,
    firstName,
}: VerificationApprovedEmailProps): Promise<void> => {
    if (!email) {
        console.warn("[Mail Service] No email provided for verification approval notification.");
        return;
    }

    const appName = process.env.APP_NAME || "GigFlow";
    const frontendUrl = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");
    const userFirstName = firstName?.trim() || "there";

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verification Approved</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 16px;">
                <tr>
                    <td align="center">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; border-collapse: separate; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                            
                            <!-- Header / Badge -->
                            <tr>
                                <td style="padding: 40px 40px 0 40px; text-align: center;">
                                    <div style="display: inline-block; width: 56px; height: 56px; background-color: #ecfdf5; border-radius: 16px; line-height: 56px; font-size: 26px; text-align: center;">
                                        ✅
                                    </div>
                                    <h1 style="margin: 16px 0 6px 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
                                        Identity Verification Approved!
                                    </h1>
                                    <p style="margin: 0; font-size: 14px; color: #059669; font-weight: 500;">
                                        Your account is now verified
                                    </p>
                                </td>
                            </tr>

                            <!-- Content -->
                            <tr>
                                <td style="padding: 24px 40px; text-align: left;">
                                    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155;">
                                        Hi <strong style="color: #0f172a;">${userFirstName}</strong> 👋,
                                    </p>
                                    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 24px; color: #475569;">
                                        Great news! Your identity verification documents have been reviewed and approved by the <strong>${appName}</strong> team.
                                    </p>

                                    <!-- Success Callout -->
                                    <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                                        <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #065f46;">
                                            🛡️ Verified Account Benefits Unlocked
                                        </p>
                                        <p style="margin: 0; font-size: 13px; line-height: 20px; color: #047857;">
                                            You now have full access to create contracts, apply for jobs, receive milestone payments, and display a verified badge on your profile.
                                        </p>
                                    </div>

                                    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 22px; color: #64748b;">
                                        <em>Tip: If your session still shows verification pending in your browser, please log out and log back in to refresh your access token.</em>
                                    </p>

                                    <!-- CTA Button -->
                                    <div style="text-align: center; margin-bottom: 24px;">
                                        <a href="${frontendUrl}/" target="_blank" style="display: inline-block; background-color: #10b981; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 13px 36px; border-radius: 10px; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);">
                                            Go to Your Dashboard
                                        </a>
                                    </div>

                                    <p style="margin: 0; font-size: 13px; line-height: 20px; color: #64748b; text-align: center;">
                                        Thank you for helping us maintain a safe and trusted community!
                                    </p>
                                </td>
                            </tr>

                            <!-- Divider -->
                            <tr>
                                <td style="padding: 0 40px;">
                                    <div style="border-top: 1px solid #f1f5f9; width: 100%;"></div>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="padding: 24px 40px 32px 40px; text-align: center;">
                                    <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 18px;">
                                        © ${new Date().getFullYear()} <strong>${appName}</strong> Team. All rights reserved.
                                    </p>
                                </td>
                            </tr>

                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;

    const plainText = `Hi ${userFirstName},\n\n` +
        `Great news! Your identity verification documents have been reviewed and approved by the ${appName} team.\n` +
        `Your account is now fully verified with complete access to platform features.\n\n` +
        `Access your dashboard here: ${frontendUrl}/`;

    try {
        console.log(`[Mail Service] Sending verification approval email to ${email}...`);
        await transporter.sendMail({
            from: `"${appName}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `🎉 Congratulations! Your Identity Verification is Approved - ${appName}`,
            text: plainText,
            html: htmlContent,
        });
        console.log(`[Mail Service] Verification approval email successfully sent to ${email}`);
    } catch (err: any) {
        console.error(`[Mail Service Error] Failed to send verification approval email to ${email}:`, err);
        throw err;
    }
};

// ==========================================
// 3. USER DECISION: Verification Rejected
// ==========================================
export const sendVerificationRejectedEmail = async ({
    email,
    firstName,
    rejectionReason,
    notes,
}: VerificationRejectedEmailProps): Promise<void> => {
    if (!email) {
        console.warn("[Mail Service] No email provided for verification rejection notification.");
        return;
    }

    const appName = process.env.APP_NAME || "GigFlow";
    const frontendUrl = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");
    const resubmitUrl = `${frontendUrl}/verify-identity`;
    const userFirstName = firstName?.trim() || "there";

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verification Request Update</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 16px;">
                <tr>
                    <td align="center">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; border-collapse: separate; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                            
                            <!-- Header / Badge -->
                            <tr>
                                <td style="padding: 40px 40px 0 40px; text-align: center;">
                                    <div style="display: inline-block; width: 56px; height: 56px; background-color: #fef2f2; border-radius: 16px; line-height: 56px; font-size: 26px; text-align: center;">
                                        ⚠️
                                    </div>
                                    <h1 style="margin: 16px 0 6px 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
                                        Verification Request Update
                                    </h1>
                                    <p style="margin: 0; font-size: 14px; color: #e11d48; font-weight: 500;">
                                        Action required to complete verification
                                    </p>
                                </td>
                            </tr>

                            <!-- Content -->
                            <tr>
                                <td style="padding: 24px 40px; text-align: left;">
                                    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155;">
                                        Hi <strong style="color: #0f172a;">${userFirstName}</strong>,
                                    </p>
                                    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 24px; color: #475569;">
                                        Thank you for submitting your identity verification documents. After careful review, our moderation team was unable to verify your identity with the documents provided.
                                    </p>

                                    <!-- Rejection Reason Card -->
                                    <div style="background-color: #fff1f2; border: 1px solid #ffe4e6; border-left: 4px solid #e11d48; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                                        <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #9f1239; text-transform: uppercase; letter-spacing: 0.03em;">
                                            Reason for Rejection:
                                        </p>
                                        <p style="margin: 0; font-size: 14px; line-height: 22px; color: #be123c;">
                                            ${rejectionReason}
                                        </p>
                                        ${
                                            notes
                                                ? `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #fecdd3;">
                                                    <span style="font-size: 12px; font-weight: 600; color: #9f1239;">Additional Feedback:</span>
                                                    <p style="margin: 4px 0 0 0; font-size: 13px; color: #881337;">${notes}</p>
                                                </div>`
                                                : ""
                                        }
                                    </div>

                                    <!-- Tips Box -->
                                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                                        <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #334155;">
                                            How to submit a successful verification:
                                        </p>
                                        <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #64748b; line-height: 20px;">
                                            <li>Ensure the document is valid, government-issued, and not expired.</li>
                                            <li>All 4 corners of the document should be clearly visible in full light.</li>
                                            <li>Ensure your name and photo are clearly legible with no blur or glare.</li>
                                        </ul>
                                    </div>

                                    <!-- CTA Button -->
                                    <div style="text-align: center; margin-bottom: 24px;">
                                        <a href="${resubmitUrl}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 13px 36px; border-radius: 10px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);">
                                            Resubmit Verification
                                        </a>
                                    </div>

                                    <p style="margin: 0; font-size: 13px; line-height: 20px; color: #64748b; text-align: center;">
                                        If you have any questions, feel free to contact our support team.
                                    </p>
                                </td>
                            </tr>

                            <!-- Divider -->
                            <tr>
                                <td style="padding: 0 40px;">
                                    <div style="border-top: 1px solid #f1f5f9; width: 100%;"></div>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="padding: 24px 40px 32px 40px; text-align: center;">
                                    <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 18px;">
                                        © ${new Date().getFullYear()} <strong>${appName}</strong> Team. All rights reserved.
                                    </p>
                                </td>
                            </tr>

                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;

    const plainText = `Hi ${userFirstName},\n\n` +
        `Thank you for submitting your identity verification documents. After review, our moderation team was unable to verify your identity.\n\n` +
        `Reason for Rejection: ${rejectionReason}\n` +
        `${notes ? `Additional Notes: ${notes}\n` : ""}\n` +
        `You can review the feedback and resubmit your verification here: ${resubmitUrl}`;

    try {
        console.log(`[Mail Service] Sending verification rejection email to ${email}...`);
        await transporter.sendMail({
            from: `"${appName}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Update regarding your Identity Verification Request - ${appName}`,
            text: plainText,
            html: htmlContent,
        });
        console.log(`[Mail Service] Verification rejection email successfully sent to ${email}`);
    } catch (err: any) {
        console.error(`[Mail Service Error] Failed to send verification rejection email to ${email}:`, err);
        throw err;
    }
};
