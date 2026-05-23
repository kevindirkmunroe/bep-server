import {NextFunction, Request, Response} from "express";

export function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
) {
    if (!(req.session as any).user) {
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    next();
}
