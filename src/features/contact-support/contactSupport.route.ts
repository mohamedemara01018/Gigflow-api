import { Router } from "express";
import {
    getAllContactTickets,
    getContactTicketById,
    createContactTicket,
    updateContactTicket,
    deleteContactTicket,
} from "./contactSupport.controller.js";

const router = Router();

// ==========================================
// CONTACT SUPPORT ROUTES
// ==========================================

router
    .route("/")
    .get(getAllContactTickets)
    .post(createContactTicket);

router
    .route("/:id")
    .get(getContactTicketById)
    .patch(updateContactTicket)
    .delete(deleteContactTicket);

export default router;