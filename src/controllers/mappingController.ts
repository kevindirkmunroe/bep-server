import pool from '../db';
import {Request, Response} from "express";
import {mapCityToRegion} from "./cityToRegionMappings";

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

export const mapZipToRegion  = async (req: Request, resp: Response) => {
    const { zip, platform } = req.query;

    console.log(`[MappingController] mapZipToRegion: zip=${zip} platform=${platform}`);
    if (typeof zip !== "string" || typeof platform !== "string") {
        return resp.status(400).json({ error: "zip and platform are required" });
    }

    const zipRes = await fetch(`https://api.zippopotam.us/us/${zip}`);

    if (!zipRes.ok) {
        return resp.status(404).json({ error: "Zip not found" });
    }

    const data = await zipRes.json();
    const city = data.places?.[0]?.["place name"];
    const region = mapCityToRegion(city, platform);

    console.log(`[MappingController] mapZipToRegion: returning region: ${region}`);

    resp.json({ zip, city, platform, region });
}

export const mapZipToCity  = async (req: Request, resp: Response) => {
    const { zip } = req.query;
    console.log(`[MappingController]: mapZipToCity: zip: ${zip}`);

    const zipRes = await fetch(`https://api.zippopotam.us/us/${zip}`);

    console.log(`zip ${zip} zipRex ${JSON.stringify(zipRes)}`);
    if (!zipRes.ok) {
        return resp.status(404).json({ error: "Zip not found" });
    }

    const data = await zipRes.json();
    const city = data.places?.[0]?.["place name"];
    console.log(`[MappingController]: mapZipToCity: returning zip ${zip} city ${city}`);

    resp.json({ zip, city });
}

