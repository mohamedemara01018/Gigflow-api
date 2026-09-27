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
    client?: Types.ObjectId | string | IPopulatedUser;
}

/**
 * Dispatches a notification to the Job Client when a Freelancer submits a new proposal.
 */
export const notifyClientOnProposalCreated = async (proposal: any) => {
    try {
        const job = proposal.job as IPopulatedJob;
        const freelancer = proposal.freelancer as IPopulatedUser;

        if (!job || !job.client) return;

        const clientId = typeof job.client === "object" ? job.client._id : job.client;
        const freelancerName = freelancer?.firstName
            ? `${freelancer.firstName} ${freelancer.lastName || ""}`.trim()
            : "A freelancer";

        const notificationTitle = "New Proposal Received";
        const notificationMessage = `${freelancerName} has submitted a proposal for your job: "${job.title || "Job"}"`;

        const notification = await Notification.create({
            recipient: clientId,
            sender: freelancer._id,
            type: NotificationType.PROPOSAL_RECEIVED,
            title: notificationTitle,
            message: notificationMessage,
            entityType: NotificationEntityType.PROPOSAL,
            entityId: proposal._id,
            link: `/proposals/${proposal._id}`,
        });

        getIO().to(`user:${clientId}`).emit(NotificationType.PROPOSAL_RECEIVED, notification);
    } catch (error) {
        console.error("Error sending proposal creation notification:", error);
    }
};

/**
 * Dispatches a notification to the Freelancer when their proposal status changes (Accepted, Rejected, Shortlisted, etc.).
 */
export const notifyFreelancerOnStatusUpdate = async (proposal: any, updatedByUserId?: string) => {
    try {
        const job = proposal.job as IPopulatedJob;
        const freelancerId = typeof proposal.freelancer === "object" ? proposal.freelancer._id : proposal.freelancer;

        if (!freelancerId) return;

        let notificationType: NotificationType;
        let notificationTitle: string;
        let notificationMessage: string;

        const jobTitle = job?.title || "your submitted job";

        switch (proposal.status) {
            case "ACCEPTED":
                notificationType = NotificationType.PROPOSAL_ACCEPTED;
                notificationTitle = "Proposal Accepted!";
                notificationMessage = `Congratulations! Your proposal for "${jobTitle}" has been accepted.`;
                break;
            case "REJECTED":
                notificationType = NotificationType.PROPOSAL_REJECTED;
                notificationTitle = "Proposal Status Updated";
                notificationMessage = `Your proposal for "${jobTitle}" was not selected.`;
                break;
            case "SHORTLISTED":
                notificationType = NotificationType.PROPOSAL_SHORTLISTED;
                notificationTitle = "Proposal Shortlisted";
                notificationMessage = `Great news! Your proposal for "${jobTitle}" has been shortlisted.`;
                break;
            default:
                notificationType = NotificationType.PROPOSAL_UPDATED;
                notificationTitle = "Proposal Status Updated";
                notificationMessage = `Your proposal status for "${jobTitle}" was updated to ${proposal.status}.`;
                break;
        }

        const notification = await Notification.create({
            recipient: freelancerId,
            sender: updatedByUserId || null,
            type: notificationType,
            title: notificationTitle,
            message: notificationMessage,
            entityType: NotificationEntityType.PROPOSAL,
            entityId: proposal._id,
            link: `/proposals/${proposal._id}`,
        });

        getIO().to(`user:${freelancerId}`).emit(notificationType, notification);
    } catch (error) {
        console.error("Error sending proposal status update notification:", error);
    }
};