import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { generatePassword } from "password-generator";
import {SessionData} from "express-session";

import pool from '../db';
import { MailProvider } from "../mailers/MailProvider";

const mailer = MailProvider.getMailer();

export const requestInvite = async (req: Request, resp: Response) => {
    const { name, email, company, use_case} = req.body;

    // dedup requests
    try{
        const result = await pool.query(`
            SELECT * from invite_requests where email = $1
        `, [email]);

        if(result.rows.length > 0 ){
            return resp.status(400).json({ error: "Invite request already received for this user" });
        }
    }catch(err){
        return resp.status(500).json({ error: "Failed to create Invite request" });
    }

    try {
        const result = await pool.query(`
            INSERT into invite_requests (name, email, company, use_case)
            VALUES ($1, $2, $3, $4)
        `, [name, email, company, use_case]);

        if(result.rowCount === 0){
            return resp.status(500).json({ error: "Failed to create Invite request" });
        }

        // Send reminder to admin
        const companyClause = company? `, company is ${company}.` : '';
        await mailer.send('bayareaeventpromoter@gmail.com', "Invite request",
            `<p>Invite request from ${email} ${companyClause}.<br/>${use_case}</p>`);

        return resp.status(200).json({message: "Invite successfully created!"});
    }catch(err){
        console.error(err);
        return resp.status(500).json({ error: "Failed to create Invite request" });
    }
}

export const checkUserLoggedIn = (req: Request, resp: Response) => {
    if (!(req.session as any).user) {
        return resp.status(401).json({
            error: "Not logged in"
        });
    }
    resp.json((req.session as any).user);
}

export const logoutUser = (req: Request, resp: Response) => {
    req.session.destroy(() => {
        resp.clearCookie("connect.sid");
        resp.json({ success: true });
    });
}

export const createUser= async ( req: Request, resp: Response) => {
    const { first_name, last_name, company, email, password, username} = req.body;

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
     try{
         const result = await pool.query(`
            INSERT INTO users (first_name, last_name, company, email, password_hash, created_at, username)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING user_id
            `,
                 [first_name, last_name, company, email, hashedPassword, new Date(), username]
             );
         return resp.status(201).json({ user_id: result.rows[0].user_id });
     }catch(err){
         console.error(err);
         return resp.status(500).json({ error: "Failed to create user" });
     }
}

export const forgotPassword = async (req: Request, resp: Response) => {
    const { userIdentifier } = req.body;
    console.log(`reset password for ${userIdentifier}`);
    try{
        const result = await pool.query( `
            SELECT *
            FROM
                users
            WHERE username = $1 OR email = $1
        `,[userIdentifier]);

        if(result.rows.length > 0){
            const user = result.rows[0];
            const tempPassword = await generatePassword(20, true);
            const newHash = await bcrypt.hash(tempPassword, 10);
            console.log(`update pwd ${tempPassword} for user: ${JSON.stringify(user)}`);
            await pool.query( `
                UPDATE users
                SET password_hash = $1, updated_at = now()
                where user_id = $2
            `,[newHash, user.user_id]);

            console.log(`new temp password for ${userIdentifier} is ${tempPassword}`);

            await mailer.send(
                user.email,
                "Reset your password",
                `<p>Your temporary password is ${tempPassword}</p>`
            );

            return resp.status(200).json({ userId: user.user_id });
        }else{
            return resp.status(404).json({
                error: `User not found: ${userIdentifier}.`,
            });
        }
    }catch(err: Error | any){
        return resp.status(500).json({ error: err.message });
    }
}

export const getUser = async( req: Request, resp: Response) => {
    const userId = req.params.userId;
    if(!userId){
        return resp.status(400).json({
            "error": "user id is required"
        });
    }

    const userQuery = `
        SELECT *
        FROM
            users
        WHERE user_id = $1
    `
    try{
        const result = await pool.query(userQuery, [
            userId
        ]);

        if (result.rows.length === 0) {
            return resp.status(404).json({
                error: `User not found: ${userId}`,
            });
        }

        return resp.json({
            userId,
            count: result.rows.length,
            data: result.rows,
        });
    }catch(err: Error | any){
        console.log(err.message);
        return resp.status(500).json({ error: err.message });
    }
}

export const getUserByEmail = async (req: Request, resp: Response) => {
    const { email } = req.query;
    try {
        const result = await pool.query(
            `SELECT *
             FROM users
             WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return resp.status(404).json({error: "User not found"});
        }

        resp.json(result.rows[0]);
    }catch(err: Error | any){
        return resp.status(500).json({ error: err.message });
    }
};

export const changeUserPassword = async (req: Request, resp: Response) => {
    const { userId, password } = req.body;
    const newHash = await bcrypt.hash(password, 10);
    try{
        const result = await pool.query(
            "UPDATE users set password_hash = $1, updated_at = now() where user_id = $2",
            [newHash, userId]
        );

        if(result.rowCount === 0){
            return resp.status(404).json({ message: "No user passwords updated!" });
        }

        return resp.status(200).json({ message: "success!" });
    }catch(err: Error | any){
        return resp.status(400).json({ error: err.message});
    }
}

export const loginUser = async (req: Request, res: Response) => {
    const { username, password } = req.body;
    console.log(`Login: user ${username} password ${password}`);
    try {
        const result = await pool.query(
            "SELECT user_id, first_name, company, password_hash FROM users WHERE username = $1",
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        const user = result.rows[0];
        const isHashed = user.password_hash.startsWith("$2b$");

        if (!isHashed) {
            // plaintext comparison (old users)
            if (user.password_hash !== password) {
                return res.status(401).json({ error: "Invalid credentials" });
            }

            // ✅ upgrade to hashed
            const newHash = await bcrypt.hash(password, 10);

            await pool.query(
                "UPDATE users SET password_hash = $1, updated_at = now() WHERE user_id = $2",
                [newHash, user.user_id]
            );

            console.log("🔄 Password upgraded to bcrypt");
        } else {
            // normal bcrypt flow
            const isMatch = await bcrypt.compare(password, user.password_hash);

            if (!isMatch) {
                return res.status(401).json({ error: "Invalid credentials" });
            }
        }

        // ✅ Login success → track it
        await pool.query(
            "INSERT INTO user_logins (user_id) VALUES ($1)",
            [user.user_id]
        );

        // Store session
        (req.session as any).user = {
            userId: user.user_id,
            username: user.username,
            firstName: user.first_name,
            company: user.company
        };

        return res.json({
            userId: user.user_id,
            firstName: user.first_name,
            company: user.company
        });
    } catch (err) {
        console.error("[loginUser]", err);
        return res.status(500).json({ error: "Server error" });
    }
};

export const validateUser = async (req: Request, res: Response) => {
    const { email, username, password, invite_code } = req.query;

    try {
        // 🔹 1. Basic presence check
        if (!email || !username || !password) {
            return res.json({
                valid: false,
                reason: "missing_fields",
                message: "Missing required fields"
            });
        }

        // 🔹 2. Password strength (simple V1 rule)
        const passwordStr = String(password);

        if (passwordStr.length < 8) {
            return res.json({
                valid: false,
                reason: "weak_password",
                message: "Password must be at least 8 characters"
            });
        }

        // 🔹 3. Check email exists
        const emailResult = await pool.query(
            "SELECT 1 FROM users WHERE email = $1 LIMIT 1",
            [email]
        );

        if (emailResult.rows.length > 0) {
            return res.json({
                valid: false,
                reason: "email_exists",
                message: "Email already registered"
            });
        }

        // 🔹 4. Check username exists
        const usernameResult = await pool.query(
            "SELECT 1 FROM users WHERE username = $1 LIMIT 1",
            [username]
        );

        if (usernameResult.rows.length > 0) {
            return res.json({
                valid: false,
                reason: "username_exists",
                message: "Username already taken"
            });
        }

        // 🔹 5. Check invite code for email exists AND registrant passed matching code
        const inviteCodeResult = await pool.query(
            "SELECT invite_code FROM invite_requests WHERE email = $1 AND status = 'approved'",
            [email]
        );
        if(inviteCodeResult.rows.length === 0){
            console.log(`[UserController] ${email} has no invite code`);
            return res.json({
                valid: false,
                reason: "invalid_invite_code",
                message: "Invalid Invite code"
            });
        }

        console.log(`user sent ${invite_code}, got ${inviteCodeResult.rows[0].invite_code}`);
        if(inviteCodeResult.rows[0].invite_code !== invite_code){
            console.log(`[UserController] ${email} invite code does not match`);
            return res.json({
                valid: false,
                reason: "invalid_invite_code",
                message: "Invalid Invite code"
            });
        }

        // ✅ All good
        return res.json({
            valid: true
        });

    } catch (err) {
        console.log("[validateUser]", err);

        return res.status(500).json({
            valid: false,
            reason: `${JSON.stringify(err)}`,
            message: "Internal server error"
        });
    }
};
