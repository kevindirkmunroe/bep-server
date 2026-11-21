import {Request, Response} from "express";
import { z } from "zod";

import pool from '../db';

const venueSchema = z.object({
    name: z.string(),
    address: z.string(),
    zip: z.string(),
    region: z.string()
});

const imageSchema = z.object({
    name: z.string(),
    url: z.union([z.literal(""), z.string().url()])
});

const defaultKeys = [
    "description",
    "description_short",
    "price",
    "website",
    "email",
    "phone",
    "image_url",
    "address",
    "venue",
    "category",
    "imported_from",
    "name",
    "organization",
    "image"
] as const;

const mappingKeys = [
    "name",
    "email",
    "title",
    "description",
    "location_name",
    "start_datetime",
    "address",
    "zip",
    "price",
    "website",
    "organization",
    "phone",
    "image",
    "region",
    "category",
    "city",
    "imported_from"
] as const;

const stringObjectSchema = <T extends readonly string[]>(
    keys: T
) => z.object(
    Object.fromEntries(
        keys.map(key => [key, z.string()])
    ) as Record<T[number], z.ZodString>
).strict();

const favoritesSchema = z.object({
    venues: z.array(venueSchema),
    images: z.array(imageSchema),
    defaults: stringObjectSchema(defaultKeys),
    mappings: stringObjectSchema(mappingKeys)
});

export const getFavorites = async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const result = await pool.query(
            `SELECT name, value
             FROM user_favorites
             WHERE user_id = $1`,
            [userId]
        );

        const favorites = {
            venues: [] as z.infer<typeof venueSchema>[],
            images: [] as z.infer<typeof imageSchema>[],
            defaults: {},
            mappings: {}
        };

        for (const row of result.rows) {
            if (row.name === "VENUES") {
                favorites.venues = row.value;
            }
            if (row.name === "IMAGES") {
                favorites.images = row.value;
            }
        }

        res.json(favorites);
    } catch (error) {
        console.error("GET favorites failed:", error);
        res.status(500).json({
            error: "Unable to load favorites"
        });
    }
}

export const saveFavorites = async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const parsed = favoritesSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({
            error: "Invalid favorites",
            details: parsed.error.flatten()
        });
        return;
    }

    const { venues, images, defaults, mappings } = parsed.data;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        for (const [name, value] of [
            ["VENUES", venues],
            ["IMAGES", images],
            ["DEFAULTS", defaults],
            ["MAPPINGS", mappings]
        ] as const) {
            await client.query(
                `INSERT INTO user_favorites
            (user_id, name, value)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (user_id, name)
         DO UPDATE SET value = EXCLUDED.value`,
                [userId, name, JSON.stringify(value)]
            );
        }

        await client.query("COMMIT");

        res.json({
            success: true,
            venues,
            images
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("PUT favorites failed:", error);
        res.status(500).json({
            error: "Unable to save favorites"
        });
    } finally {
        client.release();
    }
}
