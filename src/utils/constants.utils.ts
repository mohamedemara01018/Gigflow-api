import { IProfileInput } from "../types/schemeTypes.js";
import {
    AvailabilityStatus,
    ExperienceLevel,
    ProfileVisibility,
} from "../utils/enums.utils.js";

export const defaultProfile: Omit<IProfileInput, "user"> = {
    title: "",
    bio: "",
    overview: "",

    hourlyRate: 0,
    experienceLevel: ExperienceLevel.ENTRY,
    availability: AvailabilityStatus.AVAILABLE,

    responseTime: 24,

    completedJobs: 0,
    totalHours: 0,
    totalEarnings: 0,
    totalReviews: 0,

    averageRating: 0,
    successScore: 0,

    socialLinks: {
        website: "",
        github: "",
        linkedin: "",
        twitter: "",
        facebook: "",
        portfolio: "",
    },

    isProfileCompleted: false,
    profileViews: 0,

    visibility: ProfileVisibility.PUBLIC,
};