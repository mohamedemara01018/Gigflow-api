import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { appError } from "../../utils/appError.utils.js";
import asyncWrapper from "../../utils/asyncWrapper.utils.js";
import { ContractStatus, statusText } from "../../utils/enums.utils.js";
import { Contract } from "./contract.model.js";
import { Conversation } from "../conversation/conversation.model.js";

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
// 3. CREATE CONTRACT
// ==========================================
export const createContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const {
            job,
            proposal,
            client,
            freelancer,
            type,
            title,
            description,
            totalAmount,
            startDate,
            endDate,
            status,
        } = req.body;

        // 1. Validation
        if (
            !job ||
            !proposal ||
            !client ||
            !freelancer ||
            !type ||
            !title ||
            totalAmount === undefined
        ) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "job, proposal, client, freelancer, type, title, and totalAmount are required fields",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 2. Check for existing contract on the same proposal
        const existingContract = await Contract.findOne({ proposal });
        if (existingContract) {
            return next(
                appError({
                    statusCode: StatusCodes.CONFLICT,
                    message: "A contract already exists for this proposal",
                    statusText: statusText.FAIL,
                })
            );
        }

        // 3. Create contract
        const newContract = await Contract.create({
            job,
            proposal,
            client,
            freelancer,
            type,
            title,
            description: description || null,
            totalAmount,
            startDate: startDate || null,
            endDate: endDate || null,
            status: status || ContractStatus.DRAFT,
        });

        // 4. Update corresponding Conversation BEFORE populating (using raw ObjectIds)
        await Conversation.findOneAndUpdate(
            { client, freelancer, job },
            { contract: newContract._id },
            { new: true }
        );

        // 5. Populate references for response
        await newContract.populate([
            { path: "client", select: "firstName lastName email avatar" },
            { path: "freelancer", select: "firstName lastName email avatar" },
            { path: "job", select: "title" },
        ]);

        return res.status(StatusCodes.CREATED).json({
            status: statusText.SUCCESS,
            message: "Contract created successfully",
            data: {
                contract: newContract,
            },
        });
    }
);

// ==========================================
// 4. EDIT / UPDATE CONTRACT
// ==========================================
export const updateContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
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

        // Auto-assign timestamp fields based on status update
        if (body.status) {
            const now = new Date();
            if (body.status === ContractStatus.ACTIVE) {
                if (!body.startDate) body.startDate = now;
            } else if (body.status === ContractStatus.COMPLETED) {
                body.completedAt = now;
            } else if (body.status === ContractStatus.CANCELLED) {
                body.cancelledAt = now;
            } else if (body.status === ContractStatus.REJECTED) {
                body.rejectedAt = now;
            }
        }

        const updatedContract = await Contract.findByIdAndUpdate(
            id,
            { $set: body },
            {
                new: true,
                runValidators: true,
            }
        )
            .populate("client", "firstName lastName avatar email")
            .populate("freelancer", "firstName lastName avatar email")
            .populate("job", "title");

        if (!updatedContract) {
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
            message: "Contract updated successfully",
            data: {
                contract: updatedContract,
            },
        });
    }
);

// ==========================================
// 5. ACCEPT / REJECT CONTRACT
// ==========================================
export const respondToContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const { action, userId, rejectionReason } = req.body; // action: "accept" | "reject"

        if (!action || !userId) {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "action ('accept' | 'reject') and userId are required",
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

        const now = new Date();
        const isClient = contract.client.toString() === userId;
        const isFreelancer = contract.freelancer.toString() === userId;

        if (!isClient && !isFreelancer) {
            return next(
                appError({
                    statusCode: StatusCodes.FORBIDDEN,
                    message: "User is not a party to this contract",
                    statusText: statusText.FAIL,
                })
            );
        }

        if (action === "accept") {
            if (isClient) contract.clientAcceptedAt = now;
            if (isFreelancer) contract.freelancerAcceptedAt = now;

            // Activate contract when accepted by both parties
            if (contract.clientAcceptedAt && contract.freelancerAcceptedAt) {
                contract.status = ContractStatus.ACTIVE;
                contract.startDate = contract.startDate || now;
            }
        } else if (action === "reject") {
            contract.status = ContractStatus.REJECTED;
            contract.rejectedAt = now;
            contract.rejectedBy = userId as any;
            contract.rejectionReason = rejectionReason || null;
        } else {
            return next(
                appError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    message: "Invalid action. Expected 'accept' or 'reject'",
                    statusText: statusText.FAIL,
                })
            );
        }

        await contract.save();

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
// 6. DELETE CONTRACT
// ==========================================


export const deleteContract = asyncWrapper(
    async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;

        // 1. Find contract first to access client, freelancer, and job IDs
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

        // 2. Unset/Nullify the contract reference in the associated Conversation
        await Conversation.findOneAndUpdate(
            {
                $or: [
                    { contract: contract._id },
                    { client: contract.client, freelancer: contract.freelancer, job: contract.job },
                ],
            },
            { $set: { contract: null } }
        );

        // 3. Delete the contract
        await contract.deleteOne();

        return res.status(StatusCodes.OK).json({
            status: statusText.SUCCESS,
            message: "Contract deleted successfully",
            data: null,
        });
    }
);