import { Types } from "mongoose";
import { Notification } from "../notification/notification.model.js";
import { NotificationEntityType, NotificationType } from "../../utils/enums.utils.js";
import { getIO } from "../../socket.js";

interface ProposalNotificationTarget {
    _id: any;
    freelancer: any;
}

/**
 * Notifies all freelancers whose proposals were removed due to job deletion.
 */
export const notifyFreelancersOnJobDeletion = async (
    job: any,
    proposals: ProposalNotificationTarget[],
    senderId?: string | Types.ObjectId
): Promise<void> => {
    if (!proposals || proposals.length === 0) return;

    // Ensure senderId is normalized to string/ObjectId or undefined
    const formattedSenderId = senderId ? senderId.toString() : undefined;

    const notificationPromises = proposals.map(async (proposal) => {
        const freelancerId =
            typeof proposal.freelancer === "object"
                ? proposal.freelancer?._id
                : proposal.freelancer;

        if (!freelancerId) return;

        const notification = await Notification.create({
            recipient: freelancerId,
            sender: formattedSenderId,
            type: NotificationType.JOB_CLOSED,
            title: "Proposal Removed",
            message: `The job "${job.title}" you submitted a proposal for has been deleted by the client.`,
            entityType: NotificationEntityType.JOB,
            entityId: job._id,
            link: "/freelancer/proposals",
        });

        // Populate sender details if your Socket event relies on sender information on the frontend
        const populatedNotification = await notification.populate("sender", "firstName lastName avatar role");

        // Real-time socket event emission
        getIO()
            .to(`user:${freelancerId.toString()}`)
            .emit(NotificationType.JOB_CLOSED, populatedNotification);
    });

    await Promise.all(notificationPromises);
};