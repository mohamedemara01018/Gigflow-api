import express from 'express';
import { forgetPassword, login, logout, registerNewUser, registerWithGoogle, resendEmailCode, resetPassword, talkWithGoogle, verifyEmail } from './auth.controller.js';

const router = express.Router();


router.post('/register', registerNewUser);
router.post('/verify-email', verifyEmail);
router.post('/resend-email-code', resendEmailCode);
router.post('/login', login);
router.post('/logout', logout);
router.post('/forget-password', forgetPassword);
router.post('/reset-password', resetPassword);
router.get('/google/login', registerWithGoogle);
router.get('/google/callback', talkWithGoogle);





export default router