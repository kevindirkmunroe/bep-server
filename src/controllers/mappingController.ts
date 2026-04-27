import pool from '../db';
import {Request, Response} from "express";

const getPlatformRegion = async (zip: string, platform: string) => {
    // 1. get canonical region
    const zipRes = await pool.query(
        `SELECT canonical_region FROM zip_regions WHERE zip_code = $1`,
        [zip]
    );

    if (zipRes.rows.length === 0) return null;

    const canonical = zipRes.rows[0].canonical_region;

    // 2. map to platform region
    const mapRes = await pool.query(
        `SELECT platform_region
     FROM platform_region_mappings
     WHERE platform = $1 AND canonical_region = $2`,
        [platform, canonical]
    );

    return mapRes.rows[0]?.platform_region || null;
};

export const mapRegion  = async (req: Request, resp: Response) => {
    const { zip, platform } = req.query;

    console.log(`[mappingController] zip= ${zip} platform=${platform}`);
    if (typeof zip !== "string" || typeof platform !== "string") {
        return resp.status(400).json({ error: "Invalid params" });
    }

    const region = await getPlatformRegion(zip, platform);

    resp.json({ region });
};
