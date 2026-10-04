import { transporter } from "../config/mail.config.js";

interface SendCodeToMailProps {
    email: string;
    code: string;
    firstName?: string;
}

export const sendCodeToMail = async ({ email, code, firstName }: SendCodeToMailProps) => {
    const appName = process.env.APP_NAME || "GigFlow";
    const userFirstName = firstName?.trim() || "there";

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verification Code</title>
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
                                        ⚡
                                    </div>
                                    <h1 style="margin: 16px 0 0 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
                                        Welcome to GigFlow
                                    </h1>
                                </td>
                            </tr>

                            <!-- Content -->
                            <tr>
                                <td style="padding: 24px 40px; text-align: left;">
                                    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155;">
                                        Hi <strong style="color: #0f172a;">${userFirstName}</strong> 👋,
                                    </p>
                                    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #475569;">
                                        Thanks for signing up for <strong>GigFlow</strong>! Use the verification code below to complete your registration and verify your email:
                                    </p>

                                    <!-- OTP Box -->
                                    <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
                                        <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #4f46e5; display: inline-block;">
                                            ${code}
                                        </span>
                                    </div>

                                    <!-- Expiration Badge -->
                                    <div style="text-align: center; margin-bottom: 24px;">
                                        <span style="display: inline-block; background-color: #fff1f2; border: 1px solid #ffe4e6; color: #e11d48; font-size: 13px; font-weight: 600; padding: 6px 14px; border-radius: 9999px;">
                                            ⏱️ Expires in 5 minutes
                                        </span>
                                    </div>

                                    <p style="margin: 0; font-size: 13px; line-height: 20px; color: #64748b; text-align: center;">
                                        If you didn't request this email, you can safely ignore it.
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

    try {
        await transporter.sendMail({
            from: `"${appName}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `${code} is your ${appName} verification code`,
            text: `Hello ${userFirstName}, your ${appName} verification code is: ${code}. It expires in 5 minutes.`,
            html: htmlContent,
        });

        console.log(`[Mail Service] Verification code successfully sent to ${email}`);
    } catch (err: any) {
        console.error(`[Mail Service Error] Failed to send email to ${email}:`, err);
        throw new Error(err?.message || "Failed to send verification email");
    }
};