import { Request, Response } from "express";
import pool from '../db';

export const createUser= async( req: Request, resp: Response) => {

     const { first_name, last_name, company, email, password, username} = req.body;
     try{
         const result = await pool.query(`
            INSERT INTO users (first_name, last_name, company, email, password_hash, created_at, username)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING user_id
            `,
                 [first_name, last_name, company, email, password, new Date(), username]
             );
         return resp.status(201).json({ user_id: result.rows[0].user_id });
     }catch(err){
         console.error(err);
         return resp.status(500).json({ error: "Failed to create user" });
     }
}

export const getUser = async( req: Request, resp: Response) => {
    const userId = req.params.userId;
    if(!userId){
        return resp.status(400).json({
            "error": "user id is required"
        });
    }

    const query = `
        SELECT *
        FROM
            users
        WHERE user_id = $1
    `
    try{
        const result = await pool.query(query, [
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
        return resp.status(500).json({ error: err.message });
    }
}

// GET /users?email=...
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

export const loginUser = async (req: Request, res: Response) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(
            "SELECT user_id, password_hash FROM users WHERE username = $1",
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        const user = result.rows[0];

        // ⚠️ V1: plain text (you should upgrade to bcrypt soon)
        if (user.password_hash !== password) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // ✅ Login success → track it
        await pool.query(
            "INSERT INTO user_logins (user_id) VALUES ($1)",
            [user.user_id]
        );

        return res.json({ userId: user.user_id });
    } catch (err) {
        console.error("[loginUser]", err);
        return res.status(500).json({ error: "Server error" });
    }
};

export const validateUser = async (req: Request, res: Response) => {
    const { email, username, password } = req.query;

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
