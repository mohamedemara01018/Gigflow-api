import { Router } from "express";
import * as contractController from "./contract.controller.js";

const router = Router();

// ==========================================
// Contract Routes
// ==========================================

// GET  /api/v1/contracts - Fetch all contracts with optional filters (?client= & ?freelancer= & ?status=)
// POST /api/v1/contracts - Create a new contract offer
router
    .route("/")
    .get(contractController.getAllContracts)
    .post(contractController.createContract);

// PATCH /api/v1/contracts/:id/respond - Accept or reject a contract offer
router
    .route("/:id/respond")
    .patch(contractController.respondToContract);

// GET    /api/v1/contracts/:id - Get full details of a specific contract
// PATCH  /api/v1/contracts/:id - Update contract parameters or status
// DELETE /api/v1/contracts/:id - Delete a contract document
router
    .route("/:id")
    .get(contractController.getContractById)
    .patch(contractController.updateContract)
    .delete(contractController.deleteContract);

export default router;