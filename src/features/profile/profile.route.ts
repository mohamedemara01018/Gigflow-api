import express from 'express';
import { createNewProfile, editProfile, getAllProfiles, getUserProfileById } from './profile.controller.js';


const router = express.Router();


router.get('/', getAllProfiles)
router.get('/user-profile/:id', getUserProfileById)
router.post('/', createNewProfile)
router.patch('/:id', editProfile)

export default router