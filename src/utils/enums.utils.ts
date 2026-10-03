export enum UserRole {
    CLIENT = "client",
    FREELANCER = "freelancer",
    ADMIN = "admin",
}

export enum Sign {
    REGISTER = "register",
    LOGIN = "login",
}

export enum UserStatus {
    ACTIVE = "active",
    INACTIVE = "inactive",
    SUSPENDED = "suspended",
    BANNED = "banned",
}

export enum statusText {
    ERROR = 'Error',
    FAIL = 'Fail',
    SUCCESS = 'Success'
}

export enum cloudinaryFolderPath {
    IMAGE = 'freelance-app/images',
    PDF = 'freelance-app/pdfs'
}


export enum EmploymentType {
    FULL_TIME = "full-time",
    PART_TIME = "part-time",
    FREELANCE = "freelance",
    INTERNSHIP = "internship",
    CONTRACT = "contract",
}

export enum LanguageLevel {
    BASIC = "basic",
    CONVERSATIONAL = "conversational",
    FLUENT = "fluent",
    NATIVE = "native",
}

export enum JobDuration {
    LESS_THAN_1_MONTH = "less_than_1_month",
    ONE_TO_THREE_MONTHS = "1_to_3_months",
    THREE_TO_SIX_MONTHS = "3_to_6_months",
    MORE_THAN_6_MONTHS = "more_than_6_months",
}

export enum ExperienceLevel {
    ENTRY = "entry",
    INTERMEDIATE = "intermediate",
    EXPERT = "expert",
}

export enum AvailabilityStatus {
    AVAILABLE = "available",
    BUSY = "busy",
    NOT_AVAILABLE = "not_available",
}

export enum ProfileVisibility {
    PUBLIC = "public",
    PRIVATE = "private",
    CLIENTS_ONLY = "clients_only",
}


export enum SkillLevel {
    BEGINNER = "beginner",
    INTERMEDIATE = "intermediate",
    ADVANCED = "advanced",
    EXPERT = "expert",
}


export enum JobType {
    FIXED = "fixed",
    HOURLY = "hourly",
}


export enum JobStatus {
    DRAFT = "draft",
    OPEN = "open",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    CANCELLED = "cancelled",
    CLOSED = "closed",
}

export enum JobVisibility {
    PUBLIC = "public",
    PRIVATE = "private",
    INVITE_ONLY = "invite_only",
}


export enum AttachmentEntityType {
    JOB = "job",
    PROPOSAL = "proposal",
    MESSAGE = "message",
    MILESTONE = "milestone",
    PORTFOLIO = "portfolio",
    VERIFICATION = "verification",
}

export enum AttachmentType {
    IMAGE = "image",
    VIDEO = "video",
    AUDIO = "audio",
    DOCUMENT = "document",
    ARCHIVE = "archive",
    OTHER = "other",
}


export enum PortfolioProjectStatus {
    DRAFT = "draft",
    PUBLISHED = "published",
}


export enum VerificationStatus {
    PENDING = "pending",
    IN_REVIEW = "in_review",
    APPROVED = "approved",
    REJECTED = "rejected",
    CANCELLED = "cancelled",
}

export enum DocumentType {
    NATIONAL_ID = "national_id",
    PASSPORT = "passport",
    DRIVING_LICENSE = "driving_license",
}


export enum ProposalStatus {
    PENDING = "pending",
    SHORTLISTED = "shortlisted",
    ACCEPTED = "accepted",
    REJECTED = "rejected",
    WITHDRAWN = "withdrawn",
}

export enum DeliveryDurationUnit {
    HOURS = 'hours',
    DAYS = "days",
    WEEKS = "weeks",
    MONTHS = "months",
    YEARS = "years",
}


export enum NotificationType {
    PROPOSAL_RECEIVED = "proposal_received",
    PROPOSAL_ACCEPTED = "proposal_accepted",
    PROPOSAL_REJECTED = "proposal_rejected",
    PROPOSAL_SHORTLISTED = 'proposal_shortlisted',
    PROPOSAL_UPDATED = 'proposal_updated',

    INVITATION_RECEIVED = "invitation_received",

    CONTRACT_CREATED = "contract_created",
    CONTRACT_UPDATED = "contract_updated",
    CONTRACT_COMPLETED = "contract_completed",

    MILESTONE_CREATED = "milestone_created",
    MILESTONE_SUBMITTED = "milestone_submitted",
    MILESTONE_APPROVED = "milestone_approved",
    MILESTONE_REJECTED = "milestone_rejected",

    PAYMENT_RECEIVED = "payment_received",
    PAYMENT_SENT = "payment_sent",
    PAYMENT_FAILED = "payment_failed",

    MESSAGE_RECEIVED = "message_received",

    JOB_POSTED = "job_posted",
    JOB_CLOSED = "job_closed",

    REVIEW_RECEIVED = "review_received",

    VERIFICATION_APPROVED = "verification_approved",
    VERIFICATION_REJECTED = "verification_rejected",

    WITHDRAWAL_COMPLETED = "withdrawal_completed",
    WITHDRAWAL_FAILED = "withdrawal_failed",

    SYSTEM = "system",
}

export enum NotificationEntityType {
    JOB = "job",
    PROPOSAL = "proposal",
    CONTRACT = "contract",
    MILESTONE = "milestone",
    PAYMENT = "payment",
    MESSAGE = "message",
    REVIEW = "review",
    VERIFICATION = "verification",
    WITHDRAWAL = "withdrawal",
    SYSTEM = "system",
}


export enum ConversationStatus {
    ACTIVE = "active",
    ARCHIVED = "archived",
    BLOCKED = "blocked",
}

export enum MessageType {
    TEXT = "text",
    IMAGE = "image",
    FILE = "file",
    SYSTEM = "system",
}

export enum MessageStatus {
    SENT = "sent",
    DELIVERED = "delivered",
    READ = "read",
    FAILED = "failed",
}

export enum ContractType {
    FIXED = "fixed",
    HOURLY = "hourly",
}

export enum ContractStatus {
    DRAFT = "draft",
    ACTIVE = "active",
    PAUSED = "paused",
    COMPLETED = "completed",
    CANCELLED = "cancelled",
    REJECTED = "rejected",
    DISPUTED = "disputed",
}


export enum MilestoneStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    SUBMITTED = "submitted",
    APPROVED = "approved",
    REJECTED = "rejected",
    CANCELLED = "cancelled",
}


export enum PaymentStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
    REFUNDED = "refunded",
    PARTIALLY_REFUNDED = "partially_refunded",
    CANCELLED = "cancelled",
}

export enum PaymentType {
    MILESTONE = "milestone",
    CONTRACT = "contract",
}

export enum PaymentMethod {
    CARD = "card",
    US_BANK_ACCOUNT = "us_bank_account",
    PAYPAL = "paypal",
}