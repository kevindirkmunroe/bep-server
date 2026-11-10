declare module "express-session" {
    interface SessionData {
        googleOAuthState?: string;
        googleReturnTo?: string;
        googleSheetsToken?: string;
        user?: {
            userId: string;
            username: string;
            firstName: string;
            company?: string;
        };
    }
}
