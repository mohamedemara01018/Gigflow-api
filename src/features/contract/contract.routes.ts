import { Router } from "express";
import * as contractController from "./contract.controller.js";
import { authenticationMiddleware } from "../../middleware/authentication.middleware.js";
import { authorizationMiddleware } from "../../middleware/authorization.middleware.js";
import { UserRole } from "../../utils/enums.utils.js";

const router = Router();

// ==========================================
// Contract Routes (All Protected)
// ==========================================
router.use(authenticationMiddleware);

// GET  /api/contract - Fetch all contracts with optional filters (?client= & ?freelancer= & ?status=)
// POST /api/contract - Create a draft contract (Client only)
router
    .route("/")
    .get(contractController.getAllContracts)
    .post(
        authorizationMiddleware([UserRole.CLIENT]),
        contractController.createContract
    );

// POST /api/contract/:id/send - Send draft contract to freelancer for review (Client only)
router
    .route("/:id/send")
    .post(
        authorizationMiddleware([UserRole.CLIENT]),
        contractController.sendContract
    );

// PATCH /api/contract/:id/respond - Accept or reject a contract offer (Freelancer)
router
    .route("/:id/respond")
    .patch(
        authorizationMiddleware([UserRole.FREELANCER]),
        contractController.respondToContract
    );

// GET    /api/contract/:id - Get full details of a specific contract
// PATCH  /api/contract/:id - Update contract parameters while draft (Client only)
// DELETE /api/contract/:id - Delete a draft/rejected contract (Client only)
router
    .route("/:id")
    .get(contractController.getContractById)
    .patch(
        authorizationMiddleware([UserRole.CLIENT]),
        contractController.updateContract
    )
    .delete(
        authorizationMiddleware([UserRole.CLIENT]),
        contractController.deleteContract
    );

export default router;