declare module "express-session" {
    interface SessionData {
        user?: {
            userId: string;
            username: string;
            firstName: string;
            company?: string;
        };
    }
}
