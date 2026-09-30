import { Router } from "express";
import * as milestoneController from "./milestone.controller.js";

const router = Router();

// ==========================================
// Milestone Routes
// ==========================================

// POST /api/v1/milestones - Create a new milestone
router.post("/", milestoneController.createMilestone);

// GET /api/v1/milestones/contract/:contractId - Get all milestones for a specific contract
router.get("/contract/:contractId", milestoneController.getContractMilestones);

// Flow Transitions
// PATCH /api/v1/milestones/:id/submit - Freelancer submits milestone deliverables
// PATCH /api/v1/milestones/:id/approve - Client approves milestone and triggers payout
// PATCH /api/v1/milestones/:id/reject  - Client requests revisions on submitted work
router.patch("/:id/submit", milestoneController.submitMilestone);
router.patch("/:id/approve", milestoneController.approveMilestone);
router.patch("/:id/reject", milestoneController.rejectMilestone);

// GET    /api/v1/milestones/:id - Get milestone by ID
// PATCH  /api/v1/milestones/:id - Edit milestone details
// DELETE /api/v1/milestones/:id - Delete a milestone
router
    .route("/:id")
    .get(milestoneController.getMilestoneById)
    .patch(milestoneController.updateMilestone)
    .delete(milestoneController.deleteMilestone);

export default router;