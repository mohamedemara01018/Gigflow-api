import { Router } from "express";
import * as milestoneController from "./milestone.controller.js";
import { authenticationMiddleware } from "../../middleware/authentication.middleware.js";
import { authorizationMiddleware } from "../../middleware/authorization.middleware.js";
import { UserRole } from "../../utils/enums.utils.js";

const router = Router();

// ==========================================
// Milestone Routes (All Protected)
// ==========================================
router.use(authenticationMiddleware);

// POST /api/milestone - Create a new milestone (Client only)
router.post(
    "/",
    authorizationMiddleware([UserRole.CLIENT]),
    milestoneController.createMilestone
);

// GET /api/milestone/contract/:contractId - Get all milestones for a specific contract
router.get("/contract/:contractId", milestoneController.getContractMilestones);

// Flow Transitions
// POST & PATCH /api/milestone/:id/submit - Freelancer submits milestone deliverables
// POST & PATCH /api/milestone/:id/approve - Client approves milestone and releases funds
// POST & PATCH /api/milestone/:id/reject  - Client requests revisions on submitted work
router
    .route("/:id/submit")
    .post(
        authorizationMiddleware([UserRole.FREELANCER]),
        milestoneController.submitMilestone
    )
    .patch(
        authorizationMiddleware([UserRole.FREELANCER]),
        milestoneController.submitMilestone
    );

router
    .route("/:id/approve")
    .post(
        authorizationMiddleware([UserRole.CLIENT]),
        milestoneController.approveMilestone
    )
    .patch(
        authorizationMiddleware([UserRole.CLIENT]),
        milestoneController.approveMilestone
    );

router
    .route("/:id/reject")
    .post(
        authorizationMiddleware([UserRole.CLIENT]),
        milestoneController.rejectMilestone
    )
    .patch(
        authorizationMiddleware([UserRole.CLIENT]),
        milestoneController.rejectMilestone
    );

// GET    /api/milestone/:id - Get milestone by ID
// PATCH  /api/milestone/:id - Edit milestone details (Client only)
// DELETE /api/milestone/:id - Delete a milestone (Client only)
router
    .route("/:id")
    .get(milestoneController.getMilestoneById)
    .patch(
        authorizationMiddleware([UserRole.CLIENT]),
        milestoneController.updateMilestone
    )
    .delete(
        authorizationMiddleware([UserRole.CLIENT]),
        milestoneController.deleteMilestone
    );

export default router;