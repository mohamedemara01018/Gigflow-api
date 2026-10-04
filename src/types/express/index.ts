import { Types } from "mongoose";

declare global {
    namespace Express {
        interface Request {
            currentUser?: {
                _id: Types.ObjectId | string;
                email: string;
                role: string;
                firstName?: string;
                lastName?: string;
            };
            file?: Express.Multer.File;
            files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
        }
    }
}

export { };