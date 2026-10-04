import { transporter } from "../config/mail.config.js";

interface SendResetTokenToMailProps {
    email: string;
    resetToken: string;
    firstName?: string;
}

export const sendResetTokenToMail = async ({
    email,
    resetToken,
    firstName,
}: SendResetTokenToMailProps) => {
    const appName = process.env.APP_NAME || "GigFlow";
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
    const userFirstName = firstName?.trim() || "there";

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Password</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 16px;">
                <tr>
                    <td align="center">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; border-collapse: separate; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                            
                            <!-- Header / Logo -->
                            <tr>
                                <td style="padding: 40px 40px 0 40px; text-align: center;">
                                    <div style="display: inline-block; width: 48px; height: 48px; background-color: #eef2ff; border-radius: 12px; line-height: 48px; font-size: 20px; font-weight: bold; color: #4f46e5;">
                                        🔑
                                    </div>
                                    <h1 style="margin: 16px 0 0 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
                                        Reset Your Password
                                    </h1>
                                </td>
                            </tr>

                            <!-- Content -->
                            <tr>
                                <td style="padding: 24px 40px; text-align: left;">
                                    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155;">
                                        Hi <strong style="color: #0f172a;">${userFirstName}</strong>,
                                    </p>
                                    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #475569;">
                                        We received a request to reset your password for your <strong>GigFlow</strong> account. Click the button below to choose a new password:
                                    </p>

                                    <!-- CTA Button -->
                                    <div style="text-align: center; margin-bottom: 24px;">
                                        <a href="${resetUrl}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 10px;">
                                            Reset Password
                                        </a>
                                    </div>

                                    <!-- Fallback Link Block -->
                                    <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b;">
                                        If the button above doesn't work, copy and paste this URL into your browser:
                                    </p>
                                    <div style="background-color: #f1f5f9; border-radius: 8px; padding: 12px; word-break: break-all; font-size: 12px; font-family: monospace; color: #4f46e5; margin-bottom: 24px;">
                                        ${resetUrl}
                                    </div>

                                    <!-- Security Notice Callout -->
                                    <div style="background-color: #fffbe3; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px;">
                                        <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; color: #b45309;">
                                            ⚠️ Security Notice
                                        </p>
                                        <p style="margin: 0; font-size: 13px; line-height: 18px; color: #78350f;">
                                            This link will expire in <strong>10 minutes</strong>. If you did not request a password reset, you can safely ignore this email—your password will remain unchanged.
                                        </p>
                                    </div>
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
                                        © ${new Date().getFullYear()} <strong>${appName}</strong>. All rights reserved.
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

    try {
        await transporter.sendMail({
            from: `"${appName}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Reset your password - ${appName}`,
            text: `Hello ${userFirstName},\n\nWe received a request to reset your password. Use the link below to reset it:\n\n${resetUrl}\n\nThis link will expire in 10 minutes. If you did not request this, please ignore this email.`,
            html: htmlContent,
        });

        console.log(`[Mail Service] Password reset email successfully sent to ${email}`);
    } catch (err: any) {
        console.error(`[Mail Service Error] Failed to send password reset email to ${email}:`, err);
        throw new Error(err?.message || "Failed to send password reset email");
    }
};