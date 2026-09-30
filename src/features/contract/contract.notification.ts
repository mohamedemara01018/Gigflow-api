import { Notification } from "../notification/notification.model.js";
import { NotificationType, NotificationEntityType } from "../../utils/enums.utils.js";
import { Types } from "mongoose";
import { getIO } from "../../socket.js";

interface IPopulatedUser {
    _id: Types.ObjectId | string;
    firstName?: string;
    lastName?: string;
}

interface IPopulatedJob {
    _id: Types.ObjectId | string;
    title?: string;
}

/**
 * Dispatches a notification to the Freelancer when a Client creates/sends a Contract for review.
 */
export const notifyFreelancerOnContractOffer = async (contract: any) => {
    try {
        const freelancerId =
            typeof contract.freelancer === "object"
                ? contract.freelancer._id
                : contract.freelancer;

        const clientId =
            typeof contract.client === "object"
                ? contract.client._id
                : contract.client;

        const clientName =
            contract.client && typeof contract.client === "object" && contract.client.firstName
                ? `${contract.client.firstName} ${contract.client.lastName || ""}`.trim()
                : "The client";

        const jobId =
            typeof contract.job === "object" ? contract.job._id : contract.job;

        if (!freelancerId) return;

        const notificationTitle = "New Contract Offer Received";
        const notificationMessage = `${clientName} has sent you a contract offer: "${contract.title}" ($${Number(
            contract.totalAmount
        ).toLocaleString()})`;

        const notification = await Notification.create({
            recipient: freelancerId,
            sender: clientId || null,
            type: NotificationType.CONTRACT_CREATED,
            title: notificationTitle,
            message: notificationMessage,
            entityType: NotificationEntityType.CONTRACT,
            entityId: contract._id,
            link: `/messages?recipient=${clientId}&job=${jobId}`,
        });

        getIO().to(`user:${freelancerId}`).emit(NotificationType.CONTRACT_CREATED, notification);
    } catch (error) {
        console.error("Error sending contract offer notification:", error);
    }
};

/**
 * Dispatches a notification to the Client when the Freelancer accepts a Contract.
 */
export const notifyClientOnContractAccepted = async (contract: any) => {
    try {
        const clientId =
            typeof contract.client === "object"
                ? contract.client._id
                : contract.client;

        const freelancerId =
            typeof contract.freelancer === "object"
                ? contract.freelancer._id
                : contract.freelancer;

        const freelancerName =
            contract.freelancer && typeof contract.freelancer === "object" && contract.freelancer.firstName
                ? `${contract.freelancer.firstName} ${contract.freelancer.lastName || ""}`.trim()
                : "The freelancer";

        const jobId =
            typeof contract.job === "object" ? contract.job._id : contract.job;

        if (!clientId) return;

        const notificationTitle = "Contract Accepted!";
        const notificationMessage = `${freelancerName} has accepted your contract: "${contract.title}". The contract is now active.`;

        const notification = await Notification.create({
            recipient: clientId,
            sender: freelancerId || null,
            type: NotificationType.CONTRACT_UPDATED,
            title: notificationTitle,
            message: notificationMessage,
            entityType: NotificationEntityType.CONTRACT,
            entityId: contract._id,
            link: `/messages?recipient=${freelancerId}&job=${jobId}`,
        });

        getIO().to(`user:${clientId}`).emit(NotificationType.CONTRACT_UPDATED, notification);
    } catch (error) {
        console.error("Error sending contract accepted notification:", error);
    }
};

/**
 * Dispatches a notification to the Client when the Freelancer rejects a Contract.
 */
export const notifyClientOnContractRejected = async (contract: any) => {
    try {
        const clientId =
            typeof contract.client === "object"
                ? contract.client._id
                : contract.client;

        const freelancerId =
            typeof contract.freelancer === "object"
                ? contract.freelancer._id
                : contract.freelancer;

        const freelancerName =
            contract.freelancer && typeof contract.freelancer === "object" && contract.freelancer.firstName
                ? `${contract.freelancer.firstName} ${contract.freelancer.lastName || ""}`.trim()
                : "The freelancer";

        const jobId =
            typeof contract.job === "object" ? contract.job._id : contract.job;

        if (!clientId) return;

        const notificationTitle = "Contract Offer Rejected";
        const reasonText = contract.rejectionReason
            ? ` Reason: "${contract.rejectionReason}"`
            : "";
        const notificationMessage = `${freelancerName} has rejected the contract: "${contract.title}".${reasonText}`;

        const notification = await Notification.create({
            recipient: clientId,
            sender: freelancerId || null,
            type: NotificationType.CONTRACT_UPDATED,
            title: notificationTitle,
            message: notificationMessage,
            entityType: NotificationEntityType.CONTRACT,
            entityId: contract._id,
            link: `/messages?recipient=${freelancerId}&job=${jobId}`,
        });

        getIO().to(`user:${clientId}`).emit(NotificationType.CONTRACT_UPDATED, notification);
    } catch (error) {
        console.error("Error sending contract rejected notification:", error);
    }
};

/**
 * Dispatches a notification to the Freelancer when a Milestone is added.
 */
export const notifyFreelancerOnMilestoneCreated = async (milestone: any, contract: any) => {
    try {
        const freelancerId =
            typeof contract.freelancer === "object"
                ? contract.freelancer._id
                : contract.freelancer;

        const clientId =
            typeof contract.client === "object"
                ? contract.client._id
                : contract.client;

        const jobId =
            typeof contract.job === "object" ? contract.job._id : contract.job;

        if (!freelancerId) return;

        const notificationTitle = "New Milestone Created";
        const notificationMessage = `Milestone #${milestone.order} "${milestone.title}" ($${Number(
            milestone.amount
        ).toLocaleString()}) has been added to contract "${contract.title}".`;

        const notification = await Notification.create({
            recipient: freelancerId,
            sender: clientId || null,
            type: NotificationType.MILESTONE_CREATED,
            title: notificationTitle,
            message: notificationMessage,
            entityType: NotificationEntityType.MILESTONE,
            entityId: milestone._id,
            link: `/messages?recipient=${clientId}&job=${jobId}`,
        });

        getIO().to(`user:${freelancerId}`).emit(NotificationType.MILESTONE_CREATED, notification);
    } catch (error) {
        console.error("Error sending milestone creation notification:", error);
    }
};
