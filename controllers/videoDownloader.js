const https = require('https');
const qs = require('querystring');

const ALL_MEDIA_DOWNLOADER_HOST = 'all-media-downloader1.p.rapidapi.com';
const SOCIAL_DOWNLOADER_HOST = 'social-download-all-in-one.p.rapidapi.com';

const ALL_MEDIA_DOWNLOADER_API = process.env.ALL_MEDIA_DOWNLOADER_API;
const SOCIAL_DOWNLOADER_ALL_IN_ONE_API = process.env.SOCIAL_DOWNLOADER_ALL_IN_ONE_API;

let loadCounter = 0;

const ALL_MEDIA_APPS = ['facebook', 'insta', 'tiktok', 'twitter', 'pintrest'];
const SOCIAL_DOWNLOADER_APPS = ['facebook', 'insta', 'tiktok', 'linkedin', 'vimeo', 'snapchat', 'pintrest'];
const COMMON_APPS = ['facebook', 'insta', 'tiktok', 'pintrest'];

/**
 * Detect platform name from URL
 */
const detectPlatform = (url) => {
    if (url.includes('facebook.com')) return 'facebook';
    if (url.includes('instagram.com')) return 'insta';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('twitter.com')) return 'twitter';
    if (url.includes('pinterest.com')) return 'pintrest';
    if (url.includes('linkedin.com')) return 'linkedin';
    if (url.includes('vimeo.com')) return 'vimeo';
    if (url.includes('snapchat.com')) return 'snapchat';
    return null;
};

/**
 * Main Controller
 */
exports.downloadMedia = async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

        const platform = detectPlatform(url);
        if (!platform) return res.status(400).json({ success: false, error: 'Unsupported platform' });

        let useApi = 'allMediaDownloader';

        // Load balancing for common apps (3 requests to first API, 1 to second)
        if (COMMON_APPS.includes(platform)) {
            loadCounter++;
            if (loadCounter % 4 === 0) useApi = 'socialDownloader';
        } else if (SOCIAL_DOWNLOADER_APPS.includes(platform)) {
            useApi = 'socialDownloader';
        }

        // Call selected API
        let response = await callDownloaderApi(url, useApi);
        let normalizedResponse = normalizeResponse(response);

        // If first API failed, try the other one
        if (!normalizedResponse || normalizedResponse.media.length === 0) {
            const fallbackApi = useApi === 'allMediaDownloader' ? 'socialDownloader' : 'allMediaDownloader';
            console.log(`⚠️ First API failed — retrying with ${fallbackApi}`);
            response = await callDownloaderApi(url, fallbackApi);
            normalizedResponse = normalizeResponse(response);
            useApi = fallbackApi;
        }

        return res.json({
            success: true,
            platform,
            apiUsed: useApi,
            thumbnail: normalizedResponse.thumbnail || null,
            videos: normalizedResponse.media
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            details: error.message
        });
    }
};

/**
 * API Call Handler
 */
const callDownloaderApi = (url, apiType) => {
    return new Promise((resolve, reject) => {
        let options, body;

        if (apiType === 'allMediaDownloader') {
            options = {
                method: 'POST',
                hostname: ALL_MEDIA_DOWNLOADER_HOST,
                path: '/all',
                headers: {
                    'x-rapidapi-key': ALL_MEDIA_DOWNLOADER_API,
                    'x-rapidapi-host': ALL_MEDIA_DOWNLOADER_HOST,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };
            body = qs.stringify({ url });
        } else {
            options = {
                method: 'POST',
                hostname: SOCIAL_DOWNLOADER_HOST,
                path: '/v1/social/autolink',
                headers: {
                    'x-rapidapi-key': SOCIAL_DOWNLOADER_ALL_IN_ONE_API,
                    'x-rapidapi-host': SOCIAL_DOWNLOADER_HOST,
                    'Content-Type': 'application/json'
                }
            };
            body = JSON.stringify({ url });
        }

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const responseBody = Buffer.concat(chunks).toString();
                try {
                    resolve(JSON.parse(responseBody));
                } catch {
                    resolve({ raw: responseBody });
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
};

/**
 * ✅ Normalize responses into a unified structure
 */
const normalizeResponse = (response) => {
    try {
        if (!response) return { status: 'failed', media: [], thumbnail: null };

        let thumbnail = null;
        let media = [];

        console.log(response)

        // --- all-media-downloader typical ---
        if (response.links || response.media) {
            const items = response.links || response.media || [];
            items.forEach(item => {
                if (item.thumbnail) thumbnail = item.thumb;
                media.push({
                    url: item.url || item.link,
                    format: item.type || item.ext || 'mp4',
                    size: item.quality || item.resolution || null
                });
            });
            return { status: 'ok', thumbnail, media };
        }

        // --- social-download-all-in-one typical ---
        if (response) {
            const items = Array.isArray(response.medias)
                ? response.medias
                : Array.isArray(response.data)
                    ? response.data
                    : [response.result || response.data];

            if (response.thumbnail || response.thumb) thumbnail = response.thumbnail || response.thumb;


            items.forEach(item => {
                if (item.type === 'video') {
                    media.push({
                        url: item.url || item.download_url || item.video || null,
                        format: item.quality === 'hd_no_watermark' 
                            ? 1080
                            : item.quality === 'no_watermark' || item.quality === "video mp4 720p" ||  item.quality === "720P mp4"
                                ? 720
                                : item.quality,
                    });
                }
            });


            return { status: 'ok', thumbnail, media };
        }

        // --- fallback raw ---
        if (response.raw) {
            media.push({ url: response.raw, format: 'unknown', size: null });
            return { status: 'ok', thumbnail, media };
        }

        return { status: 'ok', thumbnail, media };
    } catch (err) {
        console.error('Normalization error:', err);
        return { status: 'failed', media: [], thumbnail: null };
    }
};
