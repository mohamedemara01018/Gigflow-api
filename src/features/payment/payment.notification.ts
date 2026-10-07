import { Notification } from "../notification/notification.model.js";
import { NotificationType, NotificationEntityType } from "../../utils/enums.utils.js";
import { getIO } from "../../socket.js";

/**
 * Dispatches a notification to the Freelancer when payment is received for a milestone/contract.
 */
export const notifyFreelancerOnPaymentReceived = async (payment: any, milestone?: any, contract?: any) => {
    try {
        const freelancerId =
            typeof payment.freelancer === "object"
                ? payment.freelancer._id
                : payment.freelancer;

        const clientId =
            typeof payment.client === "object"
                ? payment.client._id
                : payment.client;

        const clientName =
            payment.client && typeof payment.client === "object" && payment.client.firstName
                ? `${payment.client.firstName} ${payment.client.lastName || ""}`.trim()
                : "The client";

        if (!freelancerId) return;

        const milestoneTitle = milestone?.title ? ` for "${milestone.title}"` : "";
        const notificationTitle = "Payment Funded";
        const notificationMessage = `${clientName} has funded $${Number(
            payment.amount
        ).toLocaleString()}${milestoneTitle}. (Your earnings: $${Number(payment.freelancerAmount).toLocaleString()})`;

        const notification = await Notification.create({
            recipient: freelancerId,
            sender: clientId || null,
            type: NotificationType.PAYMENT_RECEIVED,
            title: notificationTitle,
            message: notificationMessage,
            entityType: NotificationEntityType.PAYMENT,
            entityId: payment._id,
            link: contract?._id ? `/dashboard/contracts/${contract._id}` : "/settings/payments",
        });

        getIO().to(`user:${freelancerId}`).emit(NotificationType.PAYMENT_RECEIVED, notification);
    } catch (error) {
        console.error("Error sending payment received notification:", error);
    }
};

/**
 * Dispatches a notification to the Client when payment is sent/funded.
 */
export const notifyClientOnPaymentSent = async (payment: any, milestone?: any, contract?: any) => {
    try {
        const clientId =
            typeof payment.client === "object"
                ? payment.client._id
                : payment.client;

        const freelancerId =
            typeof payment.freelancer === "object"
                ? payment.freelancer._id
                : payment.freelancer;

        if (!clientId) return;

        const milestoneTitle = milestone?.title ? ` for "${milestone.title}"` : "";
        const notificationTitle = "Payment Successful";
        const notificationMessage = `You successfully paid $${Number(
            payment.amount
        ).toLocaleString()}${milestoneTitle}.`;

        const notification = await Notification.create({
            recipient: clientId,
            sender: freelancerId || null,
            type: NotificationType.PAYMENT_SENT,
            title: notificationTitle,
            message: notificationMessage,
            entityType: NotificationEntityType.PAYMENT,
            entityId: payment._id,
            link: contract?._id ? `/dashboard/contracts/${contract._id}` : "/settings/payments",
        });

        getIO().to(`user:${clientId}`).emit(NotificationType.PAYMENT_SENT, notification);
    } catch (error) {
        console.error("Error sending payment sent notification:", error);
    }
};

/**
 * Dispatches a notification to the Client when payment fails.
 */
export const notifyClientOnPaymentFailed = async (payment: any, reason?: string) => {
    try {
        const clientId =
            typeof payment.client === "object"
                ? payment.client._id
                : payment.client;

        if (!clientId) return;

        const notificationTitle = "Payment Failed";
        const notificationMessage = `Your payment of $${Number(payment.amount).toLocaleString()} could not be processed.${
            reason ? ` Reason: ${reason}` : ""
        }`;

        const notification = await Notification.create({
            recipient: clientId,
            sender: null,
            type: NotificationType.PAYMENT_FAILED,
            title: notificationTitle,
            message: notificationMessage,
            entityType: NotificationEntityType.PAYMENT,
            entityId: payment._id,
            link: "/settings/payments",
        });

        getIO().to(`user:${clientId}`).emit(NotificationType.PAYMENT_FAILED, notification);
    } catch (error) {
        console.error("Error sending payment failed notification:", error);
    }
};

/**
 * Dispatches a notification to the Freelancer when milestone funds are approved & released.
 */
export const notifyFreelancerOnMilestoneFundsReleased = async (
    payment: any,
    milestone: any,
    contract: any
) => {
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

        if (!freelancerId) return;

        const amountReleased = Number(payment.freelancerAmount || milestone.amount).toLocaleString();
        const notificationTitle = "Milestone Approved & Funds Released";
        const notificationMessage = `${clientName} has approved Milestone #${milestone.order}: "${milestone.title}". $${amountReleased} has been released to your Stripe Connect account.`;

        const notification = await Notification.create({
            recipient: freelancerId,
            sender: clientId || null,
            type: NotificationType.MILESTONE_APPROVED,
            title: notificationTitle,
            message: notificationMessage,
            entityType: NotificationEntityType.MILESTONE,
            entityId: milestone._id,
            link: `/dashboard/contracts/${contract._id}`,
        });

        getIO().to(`user:${freelancerId}`).emit(NotificationType.MILESTONE_APPROVED, notification);
    } catch (error) {
        console.error("Error sending milestone funds released notification:", error);
    }
};
