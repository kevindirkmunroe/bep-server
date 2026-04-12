import { Request, Response } from "express";
import pool from '../db';

export const createUser= async( req: Request, resp: Response) => {

     const { first_name, last_name, company, email, password} = req.body;
     const client = await pool.connect();

     try{
         const result = await client.query(`
            INSERT INTO users (first_name, last_name, company, email, password_hash, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
                 [first_name, last_name, company, email, password, new Date()]
             );
         resp.status(201).json({ user_id: result.rows[0].user_id });
     }catch(err){
         console.error(err);
         resp.status(500).json({ error: "Failed to create user" });
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
        resp.status(500).json({ error: err.message });
    }
}

// GET /users?email=...
export const getUserByEmail = async (req: Request, resp: Response) => {
    const { email } = req.query;
    const client = await pool.connect();

    try {
        const result = await client.query(
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
        resp.status(500).json({ error: err.message });
    }
};
