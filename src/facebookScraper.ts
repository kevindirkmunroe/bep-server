import { ApifyClient } from 'apify-client';
import {FacebookEvent} from "./facebookTypes";

// Initialize the ApifyClient with your personal API token
// You can find your token in the Apify Console under Settings > Integrations
const client = new ApifyClient({
    token: process.env.APIFY_TOKEN
});

export async function scrapeFacebookEvent(eventUrl: string) : Promise<FacebookEvent | undefined> {

    if(!client){
        throw new Error('Apify client not initialized');
    }

    const agent = process.env.APIFY_FACEBOOK_SCRAPER_AGENT;
    if(!agent){
        throw new Error('Apify: Facebook scraper Agent not found');
    }

    // Prepare the Actor input according to its schema
    const input = {
        // Provide the direct Facebook event URL inside the startUrls array
        "startUrls": [
            { "url": eventUrl }
        ],
        // "full" opens each page for full details; "list" only captures overview search cards
        "viewType": "full",
        "maxItems": 1,
        // Optional proxy configuration (recommended for Facebook scaling)
        "proxyConfiguration": {
            "useApifyProxy": true
        }
    };

    try {
        console.log('Starting the Facebook Events Scraper...');

        // Run the Actor and wait for it to finish
        const run = await client.actor(agent).call(input);

        console.log(`Run finished successfully! Dataset ID: ${run.defaultDatasetId}`);

        // Fetch the results from the run's default dataset
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        // Log the extracted event data
        items.forEach((item) => {
            console.log('Extracted Event Details:');
            console.dir(item);
        });

        return items[0] as FacebookEvent;

    } catch (error) {
        console.error('An error occurred during the execution:', error);
    }
}
