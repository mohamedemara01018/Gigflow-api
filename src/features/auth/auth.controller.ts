import type { NextFunction, Request, Response } from "express";
import bcrypt from 'bcryptjs';
import { User } from "../user/user.model.js";
import jwt from 'jsonwebtoken'
import { appError } from "../../utils/appError.utils.js";
import generator from "generate-password";
import dotenv from 'dotenv';
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { GoogleTokenResponse, GoogleUserProfile, Sign, statusText } from "../../utils/enums.utils.js";
import { sendCodeToMail } from "../../utils/sendCodeToMail.js";
import { UserRole } from '../../utils/enums.utils.js'
import { sendResetTokenToMail } from "../../utils/sendResetTokenToMail.js";
import { roleType } from "../user/user.type.js";
import { Profile } from "../profile/profile.model.js";
import { defaultProfile } from "../../utils/constants.utils.js";
import { IProfileInput } from "../../types/schemeTypes.js";

dotenv.config();

const registerNewUser = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {

    let { firstName, lastName, email, password, role, adminRegister = false } = req.body;

    // check existing user
    const userExist = await User.findOne({ email });
    if (userExist?.email) {
        return next(
            appError({
                statusCode: 409,
                message: "User already exists, go to login",
                statusText: statusText.FAIL,
            })
        );
    }

    // validation
    if (!firstName?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Write your first name",
                statusText: statusText.FAIL,
            })
        );
    }

    if (!lastName?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Write your last name",
                statusText: statusText.FAIL,
            })
        );
    }

    if (!email?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Write your email",
                statusText: statusText.FAIL,
            })
        );
    }

    if (!password?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Write your password",
                statusText: statusText.FAIL,
            })
        );
    }

    if (!role) {
        return next(
            appError({
                statusCode: 400,
                message: "please select your role",
                statusText: statusText.FAIL,
            })
        );
    }

    if (!Object.values(UserRole).includes(role)) {
        console.log('kdfj')
        return next(
            appError({
                statusCode: 400,
                message: "your role does not vaild",
                statusText: statusText.FAIL,
            })
        );
    }

    if (!adminRegister && role == UserRole.ADMIN) {
        return next(
            appError({
                statusCode: 400,
                message: "your role must be not  admin",
                statusText: statusText.FAIL,
            })
        );
    }

    // hash password
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);


    // generate token
    const token = jwt.sign(
        { email, role, isEmailVerified: false, isIdentityVerified: false },
        process.env.JWT_TOKEN_SECRET_KEY || "jwtsecretkey",
    );

    res.cookie("token", token, {
        httpOnly: true,
        secure: false, // true in production (https)
        maxAge: 1000 * 60 * 60, // 1 hour
    });


    // generate verification code
    const emailCodeExpiresAt = String(Date.now() + (1000 * 60 * 5));
    const verifiedEmailCode = String(
        Math.floor(100000 + Math.random() * 900000)
    );
    sendCodeToMail({ code: verifiedEmailCode, email, firstName })

    const newUser = await User.create({
        firstName,
        lastName,
        email,
        password: hashPassword,
        verifiedEmailCode,
        isEmailVerified: false,
        emailCodeExpiresAt,
        role: role || 'user'
    });

    if (role == UserRole.FREELANCER) {
        const profile: IProfileInput = { ...defaultProfile, user: newUser._id }
        await Profile.create(profile)
    }

    res.status(201).json({
        message: "User created successfully",
        data: newUser,
    });
});


const verifyEmail = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const { email, code } = req.body

    if (!email?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Write your email",
                statusText: statusText.FAIL,
            })
        );
    }
    if (!code?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Write your code",
                statusText: statusText.FAIL,
            })
        );
    }

    // check existing user
    const userExist = await User.findOne({ email });
    if (!userExist?.email) {
        return next(
            appError({
                statusCode: 409,
                message: "User doesn't exists, go to Register",
                statusText: statusText.FAIL,
            })
        );
    }

    if (userExist.isEmailVerified) {
        res.status(200).json({ message: 'user already verifed,go to login', })
    }

    //check code is match verifiedCode
    if (String(code) != String(userExist.verifiedEmailCode)) {
        return next(
            appError({
                statusCode: 400,
                message: "code is wrond, try to resend new code",
                statusText: statusText.FAIL,
            })
        );
    }

    if (String(Date.now()) > String(userExist.emailCodeExpiresAt)) {
        return next(
            appError({
                statusCode: 400,
                message: "code is expired, try to resend new code",
                statusText: statusText.FAIL,
            })
        );
    }

    const updatedUser = await User.findByIdAndUpdate(userExist._id, {
        isEmailVerified: true,
        verifiedEmailCode: null,
        emailCodeExpiresAt: null
    }, { new: true })

    if (updatedUser?.isEmailVerified) {

        const token = jwt.sign({
            email: updatedUser.email,
            role: updatedUser.role,
            isEmailVerified: updatedUser.isEmailVerified,
            isIdentityVerified: updatedUser.isIdentityVerified
        }, String(process.env.JWT_TOKEN_SECRET_KEY));

        res.cookie("token", token, {
            httpOnly: true,
            secure: false, // true in production (https)
            maxAge: 1000 * 60 * 60, // 1 hour
        });

        res.status(200).json({ message: 'user verifed successfully', data: { updatedUser } })
    } else {
        res.status(400).json({ message: 'you are not verified, please try to verify your email', data: { updatedUser } })
    }

})


const resendEmailCode = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;

    if (!email?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Write your email",
                statusText: statusText.FAIL,
            })
        );
    }

    const userExist = await User.findOne({ email });
    if (!userExist?.email) {
        return next(
            appError({
                statusCode: 400,
                message: "account doesn't exist, please register",
                statusText: statusText.FAIL,
            })
        );
    }

    if (userExist.isEmailVerified) {
        return next(
            appError({
                statusCode: 400,
                message: "user is already verified, please login",
                statusText: statusText.FAIL,
            })
        );
    }

    if (userExist.verifiedEmailCode && userExist.emailCodeExpiresAt && String(userExist.emailCodeExpiresAt) > String(Date.now())) {
        return next(
            appError({
                statusCode: 400,
                message: "code already sended, check your Inbox",
                statusText: statusText.FAIL,
            })
        );
    }
    const verifiedEmailCode = String(Math.floor(100000 + Math.random() * 900000));
    const emailCodeExpiresAt = Date.now() + 1000 * 60 * 5;

    const updatedUser = await User.findByIdAndUpdate(userExist._id, {
        verifiedEmailCode,
        emailCodeExpiresAt
    }, {
        new: true
    })

    if (!updatedUser?.verifiedEmailCode) {
        return next(
            appError({
                statusCode: 400,
                message: "code doesn't resended,please try to resend it again",
                statusText: statusText.FAIL,
            })
        );
    }
    await sendCodeToMail({ email, code: verifiedEmailCode, firstName: userExist.firstName })
    res.status(200).json({ message: 'code resended successfully', data: { updatedUser } })
})


const login = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    if (!email?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "email doesn't exist or user doesn't exist",
                statusText: statusText.FAIL,
            })
        );
    }
    if (!password?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Write your password",
                statusText: statusText.FAIL,
            })
        );
    }

    const userExist = await User.findOne({ email });
    if (!userExist?.email) {
        return next(
            appError({
                statusCode: 400,
                message: "account doesn't exist, please register",
                statusText: statusText.FAIL,
            })
        );
    }

    // generate token
    const token = jwt.sign({
        email: userExist.email,
        role: userExist.role,
        isEmailVerified: userExist.isEmailVerified,
        isIdentityVerified: userExist.isIdentityVerified
    }, String(process.env.JWT_TOKEN_SECRET_KEY));

    // const { token: t } = req.cookies;
    // if (!userExist?.isEmailVerified) {
    //     if (!t) {
    //         res.cookie("token", token, {
    //             httpOnly: true,
    //             secure: false, // true in production (https)
    //             maxAge: 1000 * 60 * 60, // 1 hour
    //         });
    //     }
    //     return next(
    //         appError({
    //             statusCode: 400,
    //             message: "account doesn't verify, please verify your account",
    //             statusText: statusText.FAIL,
    //         })
    //     );
    // }

    // if (!userExist?.isIdentityVerified) {
    //     if (!t) {
    //         res.cookie("token", token, {
    //             httpOnly: true,
    //             secure: false, // true in production (https)
    //             maxAge: 1000 * 60 * 60, // 1 hour
    //         });
    //     }
    //     return next(
    //         appError({
    //             statusCode: 400,
    //             message: "account doesn't Identity, please Identity your account",
    //             statusText: statusText.FAIL,
    //         })
    //     );
    // }

    const isPasswordMatch = await bcrypt.compare(String(password), String(userExist.password))
    if (!isPasswordMatch) {
        return next(
            appError({
                statusCode: 400,
                message: "password is wrond",
                statusText: statusText.FAIL,
            })
        );
    }



    res.cookie("token", token, {
        httpOnly: true,
        secure: false, // true in production (https)
        maxAge: 1000 * 60 * 60, // 1 hour
    });

    if (!token) {
        return next(
            appError({
                statusCode: 400,
                message: "there is a problem when create token",
                statusText: statusText.FAIL,
            })
        );
    }

    await User.findByIdAndUpdate(userExist._id, {
        lastLoginAt: Date.now(),
    }, {
        new: true
    })

    res.status(200).json({ message: 'login successfully', data: { token, role: userExist.role } })
})



const logout = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    res.clearCookie('token');
    res.status(200).json({ message: 'logout successfully', data: null })
})


const forgetPassword = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;

    // Validate email
    if (!email?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Please enter your email address.",
                statusText: statusText.FAIL,
            })
        );
    }

    // Find user
    const user = await User.findOne({ email });

    if (!user) {
        return next(
            appError({
                statusCode: 404,
                message: "Account doesn't exist. Please register first.",
                statusText: statusText.FAIL,
            })
        );
    }

    // If a valid reset token already exists
    if (
        user.resetToken &&
        user.resetTokenExpiresAt &&
        String(user.resetTokenExpiresAt) > String(Date.now())
    ) {
        return res.status(200).json({
            message:
                "A password reset link has already been sent to your email. Please check your inbox.",
        });
    }

    // Generate new reset token
    const resetToken = jwt.sign(
        {
            id: user._id,
            email: user.email,
        },
        String(process.env.JWT_RESET_TOKEN_SECRET_KEY),
        {
            expiresIn: "5m",
        }
    );

    // Save token & expiration
    user.resetToken = resetToken;
    user.resetTokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await user.save();

    // Send email
    await sendResetTokenToMail({
        email: user.email,
        firstName: user.firstName,
        resetToken,
    });

    return res.status(200).json({
        message:
            "A password reset link has been sent to your email address.",
    });
}
);

const resetPassword = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const { token, password } = req.body;

    if (!token?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Please provide your token.",
                statusText: statusText.FAIL,
            })
        );
    }

    if (!password?.trim()) {
        return next(
            appError({
                statusCode: 400,
                message: "Please enter your email address.",
                statusText: statusText.FAIL,
            })
        );
    }


    const decode = jwt.verify(token, String(process.env.JWT_RESET_TOKEN_SECRET_KEY)) as { email: string, _id: string };

    const userExist = await User.findOne({ email: decode?.email });
    if (!userExist?.email) {
        return next(
            appError({
                statusCode: 404,
                message: "Please reset your password again.",
                statusText: statusText.FAIL,
            })
        );
    }



    if (!userExist.resetToken && !userExist.resetTokenExpiresAt) {
        return next(
            appError({
                statusCode: 404,
                message: "please try to click on forget button",
                statusText: statusText.FAIL,
            })
        );
    }


    if (token != userExist.resetToken) {
        return next(
            appError({
                statusCode: 404,
                message: "reset token is not correct",
                statusText: statusText.FAIL,
            })
        );
    }


    //hash password
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    const updatedUser = await User.findByIdAndUpdate(
        userExist._id,
        {
            password: hashPassword,
            resetToken: null,
            resetTokenExpiresAt: null
        },
        { new: true }
    )

    if (updatedUser?.email && updatedUser?.password) {
        return res.status(200).json({ message: "Password has been changed successfully" })
    }

})



const registerWithGoogle = asyncWrapper((req: Request, res: Response, next: NextFunction) => {
    // 1. Grab the role from the frontend query string (default to 'user')
    const chosenRole = (req.query.role as string) || UserRole.FREELANCER;
    const typeOfSign = (req.query.sign as string) || Sign.REGISTER
    // 2. Embed both a secure random ID and the role into a stringified JSON state object
    if (chosenRole == UserRole.ADMIN) {
        return res.redirect(`${process.env.CLIENT_URL}/role`);
    }

    const statePayload = {
        id: crypto.randomUUID(),
        role: chosenRole,
        sign: typeOfSign
    };
    const stateString = JSON.stringify(statePayload);

    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        response_type: "code",
        scope: "openid profile email",
        access_type: "offline",
        prompt: "consent",
        state: stateString, // <-- Google will return this exact string back to us
    });

    // Store state in cookie for CSRF security verification
    res.cookie("oauth_state", stateString, { httpOnly: true, maxAge: 5 * 60 * 1000 });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

const talkWithGoogle = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const { code, error, state } = req.query;

    if (error) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_denied`);
    }
    if (typeof code !== "string" || !code) {
        return next(
            appError({
                statusCode: 400,
                message: "Missing or invalid authorization code.",
                statusText: statusText.FAIL,
            })
        );
    }

    let chosenRole = UserRole.FREELANCER;
    let typeOfSign = Sign.REGISTER;
    if (typeof state === "string") {
        try {
            const parsedState = JSON.parse(state);
            chosenRole = parsedState.role;
            typeOfSign = parsedState.sign;
        } catch (e) {
            console.error("Failed parsing OAuth state payload", e);
        }
    }

    // 1. Exchange the code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: String(process.env.GOOGLE_CLIENT_ID),
            client_secret: String(process.env.GOOGLE_CLIENT_SECRET),
            redirect_uri: String(process.env.GOOGLE_REDIRECT_URI),
            grant_type: "authorization_code",
        }),
    });

    // Explicitly type the parsed JSON payload
    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

    if (!tokenResponse.ok) {
        return next(
            appError({
                statusCode: 400,
                message: tokenData.error_description || "Google token exchange failed",
                statusText: statusText.FAIL,
            })
        );
    }

    // 2. Get user profile
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResponse.ok) {
        return next(
            appError({
                statusCode: 400,
                message: 'Failed to fetch Google profile',
                statusText: statusText.FAIL,
            })
        );
    }

    // Explicitly type the parsed JSON payload
    const profile = (await profileResponse.json()) as GoogleUserProfile;

    // 3. Find or create the user in DB
    let user = await User.findOne({ email: profile.email });

    if (!user && typeOfSign == Sign.LOGIN) {
        res.redirect(`${process.env.CLIENT_URL}/role`);
        return;
    }

    if (user && typeOfSign == Sign.REGISTER) {
        res.redirect(`${process.env.CLIENT_URL}/login`);
        return;
    }

    if (!user) {
        const password = generator.generate({
            length: 16,
            numbers: true,
            symbols: true,
            uppercase: true,
            lowercase: true,
            strict: true,
        });
        user = await User.create({
            email: profile.email,
            firstName: profile.given_name,
            lastName: profile.family_name,
            password,
            role: chosenRole as roleType,
            isEmailVerified: profile.email_verified,
            provider: "google",
            providerId: profile.sub,
            avatar: profile.picture
        });

        if (user.role == UserRole.FREELANCER) {
            const userProfile: IProfileInput = { ...defaultProfile, user: user._id };
            await Profile.create(userProfile);
        }
    }

    // 4. Issue session/JWT
    const token = jwt.sign({
        id: user._id,
        role: user.role,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        isIdentityVerified: user.isIdentityVerified
    }, process.env.JWT_TOKEN_SECRET_KEY!, {
        expiresIn: "7d",
    });

    res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax"
    });

    if (user.isIdentityVerified) {
        res.redirect(`${process.env.CLIENT_URL}/`);
    } else {
        res.redirect(`${process.env.CLIENT_URL}/verify-identity`);
    }
})



export {
    registerNewUser,
    verifyEmail,
    resendEmailCode,
    login,
    logout,
    forgetPassword,
    resetPassword,
    registerWithGoogle,
    talkWithGoogle
}
