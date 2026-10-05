import express from 'express';
import {
    changeAvatar,
    changePassword,
    getAllUser,
    getUserById,
    me,
    removeAvatar,
    updateUser,
    updateUserStatus,
} from './user.controller.js';
import { authenticationMiddleware } from '../../middleware/authentication.middleware.js';
import { upload } from '../../middleware/multer.middleware.js';

const router = express.Router();

router
    .route('/')
    .get(getAllUser);

// Self user details (Placed BEFORE /:id so Express doesn't match 'me' as an ID)
router.get('/me', authenticationMiddleware, me);

// Update user status (e.g. PATCH /users/60d.../status)
router.patch('/:id/status', authenticationMiddleware, updateUserStatus);

router
    .route('/:id')
    .get(getUserById);

router
    .route('/update')
    .put(authenticationMiddleware, updateUser);

router
    .route('/change-password')
    .put(authenticationMiddleware, changePassword);

// Avatar management
router.put('/image/change', authenticationMiddleware, upload.single('avatar'), changeAvatar);
router.delete('/image/remove', authenticationMiddleware, removeAvatar);

export default router;