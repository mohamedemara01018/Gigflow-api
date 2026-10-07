import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { ContractStatus, ContractType, MilestoneStatus, ProposalStatus, statusText, UserRole } from "../../utils/enums.utils.js";
import { Contract } from "./contract.model.js";
import { Proposal } from "../proposal/proposal.model.js";
import { Conversation } from "../conversation/conversation.model.js";
import { Milestone } from "../milestone/milestone.model.js";
import { getIO } from "../../socket.js";
import {
    notifyFreelancerOnContractOffer,
    notifyClientOnContractAccepted,
    notifyClientOnContractRejected,
} from "./contract.notification.js";

// ==========================================
// 1. GET ALL CONTRACTS (With Filters & Pagination)
// ==========================================
export const getAllContracts = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const {
            client,
            freelancer,
            job,
            proposal,
            status,
            type,
            page = 1,
            limit = 10,
        } = req.query;

        const filter: Record<string, any> = {};

        if (client) filter.client = client;
        if (freelancer) filter.freelancer = freelancer;
        if (job) filter.job = job;
        if (proposal) filter.proposal = proposal;
        if (status) filter.status = status;
        if (type) filter.type = type;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));
        const skip = (pageNum - 1) * limitNum;

        const [contracts, totalContracts] = await Promise.all([
            Contract.find(filter)
                .populate("client", "firstName lastName avatar email")
                .populate("freelancer", "firstName lastName avatar email")
                .populate("job", "title description status")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Contract.countDocuments(filter),
        ]);

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Contracts fetched successfully",
            data: {
                totalContracts,
                currentPage: pageNum,
                totalPages: Math.ceil(totalContracts / limitNum),
                contracts,
            },
        });
    }
);

// ==========================================
// 2. GET SINGLE CONTRACT BY ID
// ==========================================
export const getContractById = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        const contract = await Contract.findById(id)
            .populate("client", "firstName lastName avatar email")
            .populate("freelancer", "firstName lastName avatar email")
            .populate("job", "title description type budget status")
            .populate("proposal");

        if (!contract) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Contract not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Contract details fetched successfully",
            data: {
                contract,
            },
        });
    }
);

// ==========================================
// 3. CREATE CONTRACT (Draft Contract from Accepted Proposal)
// ==========================================
export const createContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const currentUserId = req.currentUser?._id;
        const currentUserRole = req.currentUser?.role;

        // 1. Authenticate and verify role is Client
        if (!currentUserId || currentUserRole !== UserRole.CLIENT) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "Only a client can create a contract",
                    statusText: statusText.FAIL,
                })
            );
        }

        const {
            proposal: proposalParam,
            proposalId: proposalIdParam,
            title,
            description,
            startDate,
            endDate,
        } = req.body;

        const targetProposalId = proposalParam || proposalIdParam;

        if (!targetProposalId || !title || !title.trim()) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "proposal and title are required fields",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 2. Find Proposal and populate Job
        const proposalDoc = await Proposal.findById(targetProposalId).populate("job");
        if (!proposalDoc) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Proposal not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 3. Verify Proposal belongs to the Client's Job
        const jobDoc = proposalDoc.job as any;
        if (!jobDoc || !jobDoc.client || jobDoc.client.toString() !== currentUserId.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You are not authorized to create a contract for this proposal",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 4. Verify Proposal status is ACCEPTED
        if (proposalDoc.status !== ProposalStatus.ACCEPTED && (proposalDoc.status as string) !== "accepted") {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "A contract can only be created for an accepted proposal",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 5. Verify a Contract does not already exist for this Proposal
        const existingContract = await Contract.findOne({ proposal: proposalDoc._id });
        if (existingContract) {
            return next(
                appError({
                    statusCode: StatusCodes.CONFLICT,
                    message: "A contract already exists for this proposal",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 6. Create Draft Contract with totalAmount derived directly from Proposal.bidAmount
        const newContract = await Contract.create({
            job: jobDoc._id,
            proposal: proposalDoc._id,
            client: currentUserId,
            freelancer: proposalDoc.freelancer,
            type: jobDoc.type || ContractType.FIXED,
            title: title.trim(),
            description: description && description.trim() ? description.trim() : null,
            totalAmount: proposalDoc.bidAmount,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            status: ContractStatus.DRAFT,
            clientAcceptedAt: new Date(),
        });

        // 7. Associate Contract with corresponding Conversation
        const conversation = await Conversation.findOneAndUpdate(
            { client: currentUserId, freelancer: proposalDoc.freelancer, job: jobDoc._id },
            { contract: newContract._id },
            { new: true }
        );

        // 8. Populate references for response
        await newContract.populate([
            { path: "client", select: "firstName lastName email avatar" },
            { path: "freelancer", select: "firstName lastName email avatar" },
            { path: "job", select: "title description type budget status" },
            { path: "proposal" },
        ]);

        // 9. Real-time Socket.IO emission
        try {
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("contract:created", newContract);
            }
            getIO().to(`user:${proposalDoc.freelancer}`).emit("contract:created", newContract);
        } catch (socketError) {
            console.error("Socket emission failed:", socketError);
        }

        return res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: "Draft contract created successfully",
            data: {
                contract: newContract,
            },
        });
    }
);

// ==========================================
// 4. SEND CONTRACT TO FREELANCER (Explicit Send/Review Action)
// ==========================================
export const sendContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const currentUserId = req.currentUser?._id;

        const contract = await Contract.findById(id)
            .populate("client", "firstName lastName avatar email")
            .populate("freelancer", "firstName lastName avatar email")
            .populate("job", "title");

        if (!contract) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Contract not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Verify Client ownership
        if (contract.client?._id ? contract.client._id.toString() !== currentUserId?.toString() : contract.client.toString() !== currentUserId?.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You are not authorized to send this contract",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (contract.status !== ContractStatus.DRAFT) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Only draft contracts can be sent for review",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Send notification to Freelancer
        await notifyFreelancerOnContractOffer(contract);

        // Emit socket event to conversation room
        try {
            const conversation = await Conversation.findOne({ contract: contract._id });
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("contract:sent", contract);
                getIO().to(`conversation:${conversation._id}`).emit("contract:updated", contract);
            }
        } catch (socketError) {
            console.error("Socket emission failed:", socketError);
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Contract sent to freelancer for review successfully",
            data: {
                contract,
            },
        });
    }
);

// ==========================================
// 5. EDIT / UPDATE CONTRACT (Only Allowed While DRAFT)
// ==========================================
export const updateContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const currentUserId = req.currentUser?._id;
        const body = req.body;

        if (!body || Object.keys(body).length === 0) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Request body cannot be empty",
                    statusText: statusText.FAIL,
                })
            );
        }

        const contract = await Contract.findById(id);
        if (!contract) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Contract not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Verify Client authorization
        if (contract.client.toString() !== currentUserId?.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You are not authorized to update this contract",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Ensure contract is still in DRAFT mode
        if (contract.status !== ContractStatus.DRAFT) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Cannot modify a contract that is not in draft status",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Apply editable fields (title, description, dates)
        if (body.title && body.title.trim()) contract.title = body.title.trim();
        if (body.description !== undefined) {
            contract.description = body.description && body.description.trim() ? body.description.trim() : null;
        }
        if (body.startDate !== undefined) {
            contract.startDate = body.startDate ? new Date(body.startDate) : null;
        }
        if (body.endDate !== undefined) {
            contract.endDate = body.endDate ? new Date(body.endDate) : null;
        }

        await contract.save();

        const updatedContract = await Contract.findById(id)
            .populate("client", "firstName lastName avatar email")
            .populate("freelancer", "firstName lastName avatar email")
            .populate("job", "title description type budget status")
            .populate("proposal");

        // Emit realtime socket event
        try {
            const conversation = await Conversation.findOne({ contract: contract._id });
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("contract:updated", updatedContract);
            }
            getIO().to(`user:${contract.freelancer}`).emit("contract:updated", updatedContract);
        } catch (socketError) {
            console.error("Socket emission failed:", socketError);
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Contract updated successfully",
            data: {
                contract: updatedContract,
            },
        });
    }
);

// ==========================================
// 6. ACCEPT / REJECT CONTRACT (Freelancer Response)
// ==========================================
export const respondToContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const currentUserId = req.currentUser?._id;
        const { action, rejectionReason } = req.body; // action: "accept" | "reject"

        if (!action || !["accept", "reject"].includes(action)) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Action must be either 'accept' or 'reject'",
                    statusText: statusText.FAIL,
                })
            );
        }

        const contract = await Contract.findById(id)
            .populate("client", "firstName lastName avatar email")
            .populate("freelancer", "firstName lastName avatar email")
            .populate("job", "title description type budget status");

        if (!contract) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Contract not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        const freelancerId =
            contract.freelancer && (contract.freelancer as any)._id
                ? (contract.freelancer as any)._id.toString()
                : contract.freelancer.toString();

        if (freelancerId !== currentUserId?.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "Only the assigned freelancer can accept or reject this contract",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Contract can only be responded to while in DRAFT status
        if (contract.status !== ContractStatus.DRAFT) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: `Cannot respond to contract in '${contract.status}' status.`,
                    statusText: statusText.FAIL,
                })
            );
        }

        const now = new Date();

        if (action === "accept") {
            contract.status = ContractStatus.ACTIVE;
            contract.freelancerAcceptedAt = now;
            if (!contract.startDate) {
                contract.startDate = now;
            }

            await contract.save();

            // Optionally activate the first milestone: PENDING -> IN_PROGRESS
            const firstMilestone = await Milestone.findOne({ contract: contract._id }).sort({ order: 1 });
            if (firstMilestone && firstMilestone.status === MilestoneStatus.PENDING) {
                firstMilestone.status = MilestoneStatus.IN_PROGRESS;
                await firstMilestone.save();

                try {
                    const conversation = await Conversation.findOne({ contract: contract._id });
                    if (conversation) {
                        getIO().to(`conversation:${conversation._id}`).emit("milestone:updated", firstMilestone);
                    }
                } catch (socketErr) {
                    console.error("Failed to emit milestone update:", socketErr);
                }
            }

            // Dispatch notification to Client
            await notifyClientOnContractAccepted(contract);
        } else if (action === "reject") {
            if (!rejectionReason || !rejectionReason.trim()) {
                return next(
                    appError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        message: "A rejection reason is required when rejecting a contract",
                        statusText: statusText.FAIL,
                    })
                );
            }

            contract.status = ContractStatus.REJECTED;
            contract.rejectedAt = now;
            contract.rejectedBy = currentUserId as any;
            contract.rejectionReason = rejectionReason.trim();

            await contract.save();

            // Dispatch notification to Client
            await notifyClientOnContractRejected(contract);
        }

        // Socket.IO emission to conversation room and client room
        try {
            const conversation = await Conversation.findOne({ contract: contract._id });
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("contract:updated", contract);
            }
            const clientId =
                contract.client && (contract.client as any)._id
                    ? (contract.client as any)._id
                    : contract.client;
            getIO().to(`user:${clientId}`).emit("contract:updated", contract);
        } catch (socketError) {
            console.error("Socket emission failed:", socketError);
        }

        res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: `Contract successfully ${action}ed`,
            data: {
                contract,
            },
        });
    }
);

// ==========================================
// 7. DELETE CONTRACT (Only Allowed While DRAFT or REJECTED)
// ==========================================
export const deleteContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const currentUserId = req.currentUser?._id;

        const contract = await Contract.findById(id);
        if (!contract) {
            return next(
                appError({
                    statusCode: StatusCodes.NOT_FOUND,
                    message: "Contract not found",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Verify Client ownership
        if (contract.client.toString() !== currentUserId?.toString()) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "You are not authorized to delete this contract",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (contract.status === ContractStatus.ACTIVE || contract.status === ContractStatus.COMPLETED) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Cannot delete an active or completed contract",
                    statusText: statusText.FAIL,
                })
            );
        }

        // Delete associated Milestones
        await Milestone.deleteMany({ contract: contract._id });

        // Unset contract reference in Conversation
        const conversation = await Conversation.findOneAndUpdate(
            {
                $or: [
                    { contract: contract._id },
                    { client: contract.client, freelancer: contract.freelancer, job: contract.job },
                ],
            },
            { $set: { contract: null } },
            { new: true }
        );

        // Delete Contract
        await contract.deleteOne();

        // Realtime socket event
        try {
            if (conversation) {
                getIO().to(`conversation:${conversation._id}`).emit("contract:deleted", {
                    contractId: id,
                    conversationId: conversation._id,
                });
            }
        } catch (socketError) {
            console.error("Socket emission failed:", socketError);
        }

        return res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Contract deleted successfully",
            data: null,
        });
    }
);

// ==========================================
// 8. ACCEPT CONTRACT EXPLICIT ENDPOINT (Freelancer Only)
// ==========================================
export const acceptContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        req.body = { ...req.body, action: "accept" };
        return respondToContract(req, res, next);
    }
);

// ==========================================
// 9. REJECT CONTRACT EXPLICIT ENDPOINT (Freelancer Only)
// ==========================================
export const rejectContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        req.body = { ...req.body, action: "reject" };
        return respondToContract(req, res, next);
    }
);