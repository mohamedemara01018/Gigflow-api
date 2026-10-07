import { stripe } from "../../config/stripe.js";
import { User } from "../user/user.model.js";
import { PaymentMethod, PaymentMethodModel, IPaymentMethodDocument } from "./paymentMethod.model.js";
import { appError } from "../../utils/appError.utils.js";
import { StatusCodes } from "http-status-codes";
import { statusText, UserRole } from "../../utils/enums.utils.js";
import Stripe from "stripe";

export const getOrCreateStripeCustomer = async (user: any): Promise<string> => {
    if (user.stripeCustomerId) {
        return user.stripeCustomerId;
    }

    const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        metadata: {
            userId: user._id.toString(),
        },
    });

    user.stripeCustomerId = customer.id;
    await user.save();
    return customer.id;
};

export const createSetupIntentService = async (userId: string) => {
    const user = await User.findById(userId);
    if (!user) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "User not found",
            statusText: statusText.FAIL,
        });
    }

    const stripeCustomerId = await getOrCreateStripeCustomer(user);

    let setupIntent: Stripe.SetupIntent;

    try {
        setupIntent = await stripe.setupIntents.create({
            customer: stripeCustomerId,
            // payment_method_types: ["card", "us_bank_account"],
            usage: "off_session",
            metadata: {
                userId: user._id.toString(),
            },
        });
    } catch {
        setupIntent = await stripe.setupIntents.create({
            customer: stripeCustomerId,
            usage: "off_session",
            metadata: {
                userId: user._id.toString(),
            },
        });
    }

    return {
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
        customerId: stripeCustomerId,
    };
};

export const syncOrSavePaymentMethodService = async (
    userId: string,
    stripePaymentMethodId?: string,
    setupIntentId?: string
): Promise<IPaymentMethodDocument> => {
    const user = await User.findById(userId);
    if (!user) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "User not found",
            statusText: statusText.FAIL,
        });
    }

    const stripeCustomerId = await getOrCreateStripeCustomer(user);

    let pmId = stripePaymentMethodId;
    if (!pmId && setupIntentId) {
        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
        pmId =
            typeof setupIntent.payment_method === "string"
                ? setupIntent.payment_method
                : setupIntent.payment_method?.id;
    }

    if (!pmId) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "Missing payment method or setup intent identifier",
            statusText: statusText.FAIL,
        });
    }

    // 1. Retrieve the PaymentMethod from Stripe
    const stripePaymentMethod = await stripe.paymentMethods.retrieve(pmId);

    // 2. Prevent duplicate payment methods for this user
    // A) Check duplicate by stripePaymentMethodId
    const existingActiveById = await PaymentMethodModel.findOne({
        user: user._id,
        stripePaymentMethodId: stripePaymentMethod.id,
        isActive: true,
    });

    if (existingActiveById) {
        throw appError({
            statusCode: StatusCodes.CONFLICT,
            message: "This payment method is already added to your account.",
            statusText: statusText.FAIL,
        });
    }

    // B) Check duplicate by Card details (brand + last4 + exp)
    if (stripePaymentMethod.type === "card" || stripePaymentMethod.card) {
        const cardLast4 = stripePaymentMethod.card?.last4;
        const expMonth = stripePaymentMethod.card?.exp_month;
        const expYear = stripePaymentMethod.card?.exp_year;

        if (cardLast4) {
            const duplicateCard = await PaymentMethodModel.findOne({
                user: user._id,
                isActive: true,
                type: PaymentMethod.CARD,
                "card.last4": cardLast4,
                "card.expMonth": expMonth || null,
                "card.expYear": expYear || null,
            });

            if (duplicateCard) {
                throw appError({
                    statusCode: StatusCodes.CONFLICT,
                    message: `Card ending in ${cardLast4} is already added to your account.`,
                    statusText: statusText.FAIL,
                });
            }
        }
    }

    // C) Check duplicate by US Bank Account details (bankName + last4)
    if (stripePaymentMethod.type === "us_bank_account" || stripePaymentMethod.us_bank_account) {
        const bankLast4 = stripePaymentMethod.us_bank_account?.last4;
        if (bankLast4) {
            const duplicateBank = await PaymentMethodModel.findOne({
                user: user._id,
                isActive: true,
                type: PaymentMethod.US_BANK_ACCOUNT,
                "usBankAccount.last4": bankLast4,
            });

            if (duplicateBank) {
                throw appError({
                    statusCode: StatusCodes.CONFLICT,
                    message: `Bank account ending in ${bankLast4} is already added to your account.`,
                    statusText: statusText.FAIL,
                });
            }
        }
    }

    // D) Check duplicate by PayPal email
    if (stripePaymentMethod.type === "paypal" || stripePaymentMethod.paypal) {
        const paypalEmail = (
            stripePaymentMethod.paypal?.payer_email ||
            stripePaymentMethod.billing_details?.email
        )?.toLowerCase();

        if (paypalEmail) {
            const duplicatePaypal = await PaymentMethodModel.findOne({
                user: user._id,
                isActive: true,
                type: PaymentMethod.PAYPAL,
                "paypal.email": paypalEmail,
            });

            if (duplicatePaypal) {
                throw appError({
                    statusCode: StatusCodes.CONFLICT,
                    message: `PayPal account (${paypalEmail}) is already added to your account.`,
                    statusText: statusText.FAIL,
                });
            }
        }
    }

    // 3. Attach PaymentMethod to Stripe Customer if not attached
    const currentPmCustomer =
        typeof stripePaymentMethod.customer === "string"
            ? stripePaymentMethod.customer
            : stripePaymentMethod.customer?.id;

    if (!currentPmCustomer) {
        try {
            await stripe.paymentMethods.attach(pmId, {
                customer: stripeCustomerId,
            });
        } catch (attachErr) {
            console.warn("Notice: payment method attach response:", attachErr);
        }
    }

    // 4. Determine if it should be default (if user has no other active default)
    let existingPaymentMethod = await PaymentMethodModel.findOne({
        stripePaymentMethodId: stripePaymentMethod.id,
    });

    const hasDefault = await PaymentMethodModel.exists({
        user: user._id,
        isDefault: true,
        isActive: true,
    });

    const isDefault = !hasDefault;

    if (!existingPaymentMethod) {
        existingPaymentMethod = new PaymentMethodModel({
            user: user._id,
            stripePaymentMethodId: stripePaymentMethod.id,
            type: PaymentMethod.CARD,
            isDefault,
            isActive: true,
        });
    } else {
        existingPaymentMethod.user = user._id;
        existingPaymentMethod.isActive = true;
        if (!hasDefault) {
            existingPaymentMethod.isDefault = true;
        }
    }

    // 5. Extract safe fields strictly matching the 3 supported types: card, us_bank_account, paypal
    if (stripePaymentMethod.type === "us_bank_account" || stripePaymentMethod.us_bank_account) {
        existingPaymentMethod.type = PaymentMethod.US_BANK_ACCOUNT;
        existingPaymentMethod.usBankAccount = {
            bankName: stripePaymentMethod.us_bank_account?.bank_name ?? "US Bank Account",
            last4: stripePaymentMethod.us_bank_account?.last4 ?? null,
            accountType:
                (stripePaymentMethod.us_bank_account?.account_type as "checking" | "savings") ?? "checking",
        };
    } else if (stripePaymentMethod.type === "paypal" || stripePaymentMethod.paypal) {
        existingPaymentMethod.type = PaymentMethod.PAYPAL;
        existingPaymentMethod.paypal = {
            payerId: stripePaymentMethod.paypal?.payer_id ?? null,
            email: stripePaymentMethod.paypal?.payer_email ?? stripePaymentMethod.billing_details?.email ?? null,
        };
    } else {
        // Card (including regional card providers or wallets)
        existingPaymentMethod.type = PaymentMethod.CARD;
        const cardObj = stripePaymentMethod.card;
        existingPaymentMethod.card = {
            brand: cardObj?.brand ? cardObj.brand.toUpperCase() : String(stripePaymentMethod.type || "CARD").toUpperCase(),
            last4: cardObj?.last4 ?? ((stripePaymentMethod as any)[stripePaymentMethod.type]?.last4 ?? null),
            expMonth: cardObj?.exp_month ?? null,
            expYear: cardObj?.exp_year ?? null,
        };
    }

    await existingPaymentMethod.save();

    if (existingPaymentMethod.isDefault) {
        try {
            await stripe.customers.update(stripeCustomerId, {
                invoice_settings: { default_payment_method: stripePaymentMethod.id },
            });
        } catch (err) {
            console.error("Failed to update default payment method in Stripe:", err);
        }
    }

    return existingPaymentMethod;
};

export const getUserPaymentMethodsService = async (userId: string) => {
    return PaymentMethodModel.find({
        user: userId,
        isActive: true,
    })
        .select("-__v")
        .sort({ isDefault: -1, createdAt: -1 });
};

export const getPaymentMethodByIdService = async (userId: string, paymentMethodId: string) => {
    const paymentMethod = await PaymentMethodModel.findOne({
        _id: paymentMethodId,
        user: userId,
        isActive: true,
    }).select("-__v");

    if (!paymentMethod) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Payment method not found",
            statusText: statusText.FAIL,
        });
    }

    return paymentMethod;
};

export const setDefaultPaymentMethodService = async (userId: string, paymentMethodId: string) => {
    const existing = await PaymentMethodModel.findOne({
        _id: paymentMethodId,
        user: userId,
        isActive: true,
    });

    if (!existing) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Payment method not found",
            statusText: statusText.FAIL,
        });
    }

    // 1. Reset all methods for this user to isDefault: false
    await PaymentMethodModel.updateMany(
        { user: existing.user, isActive: true },
        { $set: { isDefault: false } }
    );

    // 2. Set chosen method to isDefault: true
    const updatedPaymentMethod = await PaymentMethodModel.findByIdAndUpdate(
        paymentMethodId,
        { $set: { isDefault: true } },
        { new: true }
    );

    const user = await User.findById(userId);
    if (user?.stripeCustomerId && existing.stripePaymentMethodId) {
        try {
            await stripe.customers.update(user.stripeCustomerId, {
                invoice_settings: {
                    default_payment_method: existing.stripePaymentMethodId,
                },
            });
        } catch (err) {
            console.error("Failed to update default payment method in Stripe:", err);
        }
    }

    return updatedPaymentMethod || existing;
};

export const deletePaymentMethodService = async (userId: string, paymentMethodId: string) => {
    const paymentMethod = await PaymentMethodModel.findOne({
        _id: paymentMethodId,
        user: userId,
        isActive: true,
    });

    if (!paymentMethod) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "Payment method not found",
            statusText: statusText.FAIL,
        });
    }

    // Disallow deleting default payment method
    if (paymentMethod.isDefault) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "You cannot delete your default payment method. Please set another payment method as default first.",
            statusText: statusText.FAIL,
        });
    }

    // 1. Soft delete / deactivate
    paymentMethod.isActive = false;
    paymentMethod.isDefault = false;
    await paymentMethod.save();

    // 2. Detach from Stripe
    try {
        if (paymentMethod.stripePaymentMethodId) {
            await stripe.paymentMethods.detach(paymentMethod.stripePaymentMethodId);
        }
    } catch (stripeError) {
        console.error("Failed to detach payment method from Stripe:", stripeError);
    }

    return paymentMethod;
};

export const createV2ConnectAccount = async (
    user: any
): Promise<string> => {
    const response = await stripe.v2.core.accounts.create(
        {
            contact_email: user.email,

            identity: {
                country: "US",
                entity_type: "individual",
            },

            dashboard: "express",

            defaults: {
                responsibilities: {
                    fees_collector: "stripe",
                    losses_collector: "stripe",
                },
            },

            configuration: {
                merchant: {
                    capabilities: {
                        card_payments: {
                            requested: true,
                        },
                    },
                },
            },

            metadata: {
                userId: user._id.toString(),
            },
        },
        {
            apiVersion: "2026-09-30.preview",
        }
    );

    console.log(
        "✅ Stripe V2 Managed Risk account created:",
        response.id
    );

    return response.id;
};
/**
 * Ensures a connected account has the recipient.capabilities.stripe_balance.stripe_transfers capability requested.
 * Automatically updates accounts created earlier without this capability.
 */
export const ensureRecipientCapability = async (accountId: string): Promise<void> => {
    try {
        const account = await stripe.v2.core.accounts.retrieve(accountId, {
            include: ["configuration.recipient"],
        });

        const transfersCapability =
            account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;

        if (!transfersCapability || (transfersCapability.status !== "active" && transfersCapability.status !== "pending")) {
            await stripe.v2.core.accounts.update(accountId, {
                configuration: {
                    recipient: {
                        capabilities: {
                            stripe_balance: {
                                stripe_transfers: {
                                    requested: true,
                                },
                            },
                        },
                    },
                },
            });
        }
    } catch (err) {
        console.error(`[ensureRecipientCapability Warning for ${accountId}]:`, err);
    }
};

export const createConnectOnboardingLinkService = async (userId: string) => {
    const user = await User.findById(userId);
    if (!user) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "User not found",
            statusText: statusText.FAIL,
        });
    }

    if (user.role !== UserRole.FREELANCER) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "Only freelancers can set up a Stripe Connect payout account",
            statusText: statusText.FAIL,
        });
    }

    // 1. Create V2 Connect Account if not existing
    if (!user.stripeConnectAccountId) {
        const accountId = await createV2ConnectAccount(user);
        user.stripeConnectAccountId = accountId;
        user.stripeConnectOnboardingComplete = false;
        await user.save();
    } else {
        // Confirm account existence in Stripe and ensure recipient capability
        try {
            await stripe.v2.core.accounts.retrieve(user.stripeConnectAccountId);
            await ensureRecipientCapability(user.stripeConnectAccountId);
        } catch (err: any) {
            if (err?.code === "resource_missing" || err?.statusCode === 404) {
                const accountId = await createV2ConnectAccount(user);
                user.stripeConnectAccountId = accountId;
                user.stripeConnectOnboardingComplete = false;
                await user.save();
            }
        }
    }

    // 2. Create Stripe Account Link (V2)
    const frontendUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const accountLink = await stripe.v2.core.accountLinks.create({
        account: user.stripeConnectAccountId,
        use_case: {
            type: "account_onboarding",
            account_onboarding: {
                refresh_url: `${frontendUrl}/settings/payments/connect/refresh`,
                return_url: `${frontendUrl}/settings/payments/connect/return`,
            },
        },
    });

    return {
        url: accountLink.url,
        stripeConnectAccountId: user.stripeConnectAccountId,
    };
};

export const getConnectAccountStatusService = async (userId: string) => {
    const user = await User.findById(userId);
    if (!user) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "User not found",
            statusText: statusText.FAIL,
        });
    }

    if (user.role !== UserRole.FREELANCER) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "Only freelancers can access Stripe Connect payout status",
            statusText: statusText.FAIL,
        });
    }

    if (!user.stripeConnectAccountId) {
        return {
            hasConnectAccount: false,
            stripeConnectAccountId: null,
            detailsSubmitted: false,
            chargesEnabled: false,
            payoutsEnabled: false,
            onboardingComplete: false,
        };
    }

    try {
        const response = await stripe.v2.core.accounts.retrieve(
            user.stripeConnectAccountId,
            {
                include: [
                    "configuration.recipient",
                    "requirements",
                ],
            }
        );

        const account = response;

        // Check if there are blocking currently_due or past_due requirements
        const hasBlockingRequirements = (account.requirements?.entries || []).some(
            (entry: any) =>
                entry.impact?.restricts_capability?.deadline?.status === "currently_due" ||
                entry.impact?.restricts_capability?.deadline?.status === "past_due"
        );

        // Check recipient capabilities for transfers/payouts
        const recipientConfig = account.configuration?.recipient;
        const transfersStatus =
            recipientConfig?.capabilities?.stripe_balance?.stripe_transfers?.status;
        const payoutsStatus =
            recipientConfig?.capabilities?.stripe_balance?.payouts?.status;

        let v1PayoutsEnabled = false;
        let v1DetailsSubmitted = false;
        try {
            const v1Acc = await stripe.accounts.retrieve(user.stripeConnectAccountId);
            v1PayoutsEnabled = Boolean(v1Acc.payouts_enabled);
            v1DetailsSubmitted = Boolean(v1Acc.details_submitted);
        } catch { }

        const detailsSubmitted = v1DetailsSubmitted || !hasBlockingRequirements;
        const payoutsEnabled = payoutsStatus === "active" || v1PayoutsEnabled;
        const chargesEnabled = transfersStatus === "active" || (transfersStatus === "pending" && !hasBlockingRequirements);
        const onboardingComplete = Boolean(payoutsEnabled || (detailsSubmitted && chargesEnabled));

        if (user.stripeConnectOnboardingComplete !== onboardingComplete) {
            user.stripeConnectOnboardingComplete = onboardingComplete;
            await user.save();
        }

        return {
            hasConnectAccount: true,
            stripeConnectAccountId: user.stripeConnectAccountId,
            detailsSubmitted,
            chargesEnabled,
            payoutsEnabled,
            onboardingComplete,
        };
    } catch (err: any) {
        console.error("Failed to retrieve Stripe Connect account status:", err);
        return {
            hasConnectAccount: true,
            stripeConnectAccountId: user.stripeConnectAccountId,
            detailsSubmitted: false,
            chargesEnabled: false,
            payoutsEnabled: false,
            onboardingComplete: false,
        };
    }
};

export const createConnectDashboardLinkService = async (userId: string) => {
    const user = await User.findById(userId);
    if (!user) {
        throw appError({
            statusCode: StatusCodes.NOT_FOUND,
            message: "User not found",
            statusText: statusText.FAIL,
        });
    }

    if (user.role !== UserRole.FREELANCER) {
        throw appError({
            statusCode: StatusCodes.FORBIDDEN,
            message: "Only freelancers have access to payout dashboard",
            statusText: statusText.FAIL,
        });
    }

    if (!user.stripeConnectAccountId) {
        throw appError({
            statusCode: StatusCodes.BAD_REQUEST,
            message: "No Stripe Connect payout account found. Please connect your account first.",
            statusText: statusText.FAIL,
        });
    }

    try {
        const loginLink = await stripe.accounts.createLoginLink(user.stripeConnectAccountId);
        return {
            url: loginLink.url,
        };
    } catch (loginErr: any) {
        // If the account has not completed onboarding or cannot create login link yet, return onboarding link (V2)
        const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:3000";
        const accountLink = await stripe.v2.core.accountLinks.create({
            account: user.stripeConnectAccountId,
            use_case: {
                type: "account_onboarding",
                account_onboarding: {
                    refresh_url: `${frontendUrl}/settings/payments/connect/refresh`,
                    return_url: `${frontendUrl}/settings/payments/connect/return`,
                },
            },
        });
        return {
            url: accountLink.url,
        };
    }
};

export const handleSetupIntentSucceededWebhook = async (setupIntent: Stripe.SetupIntent) => {
    const paymentMethodId =
        typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method?.id;

    let userId = setupIntent.metadata?.userId;

    if (!userId && setupIntent.customer) {
        const customerId =
            typeof setupIntent.customer === "string"
                ? setupIntent.customer
                : setupIntent.customer.id;
        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
            userId = user._id.toString();
        }
    }

    if (!userId) {
        console.warn("[Webhook] Could not determine GigFlow user for SetupIntent:", setupIntent.id);
        return;
    }

    try {
        await syncOrSavePaymentMethodService(userId, paymentMethodId, setupIntent.id);
        console.log(`[Webhook] Successfully saved payment method for user ${userId}`);
    } catch (err) {
        console.error("[Webhook] Error saving payment method from webhook:", err);
    }
};

export const handleAccountUpdatedWebhook = async (account: Stripe.Account) => {
    try {
        const user = await User.findOne({
            $or: [
                { stripeConnectAccountId: account.id },
                ...(account.metadata?.userId ? [{ _id: account.metadata.userId }] : []),
            ],
        });

        if (!user) {
            console.warn(`[Webhook] No user found for Connect Account ${account.id}`);
            return;
        }

        // Re-fetch via V2 API for accurate status
        let isComplete = false;
        try {
            const v2Account = await stripe.v2.core.accounts.retrieve(
                account.id,
                { include: ["configuration.recipient", "requirements"] }
            );
            const hasBlockingRequirements = (v2Account.requirements?.entries || []).some(
                (entry: any) =>
                    entry.impact?.restricts_capability?.deadline?.status === "currently_due" ||
                    entry.impact?.restricts_capability?.deadline?.status === "past_due"
            );
            const recipientConfig = v2Account.configuration?.recipient;
            const transfersStatus =
                recipientConfig?.capabilities?.stripe_balance?.stripe_transfers?.status;
            const payoutsStatus =
                recipientConfig?.capabilities?.stripe_balance?.payouts?.status;
            const transfersActive = transfersStatus === "active";
            const payoutsActive = payoutsStatus === "active";

            isComplete = Boolean(
                payoutsActive ||
                transfersActive ||
                account.payouts_enabled ||
                (account.details_submitted && !hasBlockingRequirements)
            );
        } catch (v2Err) {
            // Fallback to v1 fields from webhook payload
            isComplete = Boolean(account.details_submitted && (account.payouts_enabled || account.charges_enabled));
        }

        user.stripeConnectOnboardingComplete = isComplete;
        if (!user.stripeConnectAccountId) {
            user.stripeConnectAccountId = account.id;
        }
        await user.save();
        console.log(`[Webhook] Synchronized Connect status for user ${user._id}: complete=${isComplete}`);
    } catch (err) {
        console.error("[Webhook] Error handling account.updated:", err);
    }
};
