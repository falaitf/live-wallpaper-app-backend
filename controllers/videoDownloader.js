const https = require('https');
const qs = require('querystring');

const ALL_MEDIA_DOWNLOADER_HOST = 'all-media-downloader1.p.rapidapi.com';
const SOCIAL_DOWNLOADER_HOST = 'social-download-all-in-one.p.rapidapi.com';

const ALL_MEDIA_DOWNLOADER_API = process.env.ALL_MEDIA_DOWNLOADER_API;
const SOCIAL_DOWNLOADER_ALL_IN_ONE_API = process.env.SOCIAL_DOWNLOADER_ALL_IN_ONE_API;

let loadCounter = 0;

const ALL_MEDIA_APPS = ['facebook', 'insta', 'twitter', 'snapchat'];
const SOCIAL_DOWNLOADER_APPS = ['facebook', 'insta', 'tiktok', 'linkedin', 'pintrest'];
const COMMON_APPS = ['facebook', 'insta'];

const detectPlatform = (url) => {
    if (!url) return null;
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch'))
        return 'facebook';
    if (lowerUrl.includes('instagram.com'))
        return 'instagram';
    if (lowerUrl.includes('tiktok.com'))
        return 'tiktok';
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com'))
        return 'twitter';
    if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it'))
        return 'pintrest';
    if (lowerUrl.includes('linkedin.com'))
        return 'linkedin';
    if (lowerUrl.includes('snapchat.com'))
        return 'snapchat';

    return null;
};

exports.downloadMedia = async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

        const platform = detectPlatform(url);
        if (!platform) return res.status(400).json({ success: false, error: 'Unsupported platform' });

        let useApi = 'allMediaDownloader';

        if (platform === 'twitter' || platform === 'snapchat') {
            useApi = 'allMediaDownloader';
        } else if (COMMON_APPS.includes(platform)) {
            loadCounter++;
            useApi = loadCounter % 4 === 0 ? 'socialDownloader' : 'allMediaDownloader';
        } else if (ALL_MEDIA_APPS.includes(platform)) {
            useApi = 'allMediaDownloader';
        } else if (SOCIAL_DOWNLOADER_APPS.includes(platform)) {
            useApi = 'socialDownloader';
        }

        // Call selected API
        let response = await callDownloaderApi(url, useApi);
        let normalizedResponse = normalizeResponse(response, useApi);

        // If first API failed, try the other one
        if (!normalizedResponse || normalizedResponse.media.length === 0) {
            const fallbackApi = useApi === 'allMediaDownloader' ? 'socialDownloader' : 'allMediaDownloader';
            console.log(`⚠️ First API failed — retrying with ${fallbackApi}`);
            response = await callDownloaderApi(url, fallbackApi);
            normalizedResponse = normalizeResponse(response, fallbackApi);
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

                // Check if HTML (common RapidAPI error)
                if (responseBody.trim().startsWith('<!DOCTYPE html') || responseBody.trim().startsWith('<html')) {
                    console.warn(`⚠️ ${apiType} returned HTML instead of JSON.`);
                    return resolve({
                        error: 'Invalid API response (HTML)',
                        raw: responseBody
                    });
                }

                try {
                    const parsed = JSON.parse(responseBody);
                    resolve(parsed);
                } catch (e) {
                    console.warn(`⚠️ ${apiType} returned invalid JSON.`);
                    resolve({ raw: responseBody });
                }
            });
        });

        req.on('error', (err) => {
            console.error(`❌ Request error from ${apiType}:`, err.message);
            reject(err);
        });

        req.write(body);
        req.end();
    });
};

/**
 * ✅ Normalize responses into a unified structure
 */
const normalizeResponse = (response, useApi) => {
    try {
        if (!response) return { status: 'failed', media: [], thumbnail: null };

        let thumbnail = null;
        let media = [];

        // --- all-media-downloader updated ---
        if (useApi === "allMediaDownloader") {
            const formats = response.formats || [];
            thumbnail = response.thumbnail || response.thumbnails?.[0]?.url || null;

            const seenFormats = new Set();

            for (const format of formats) {
                if (!format.url || !format.vcodec || format.ext !== 'mp4') continue;

                const resolution = format.resolution || "";
                const height = parseInt(resolution.split("x")[1]) || 720;
                const quality = height >= 1080 ? 1080 : 720;

                // Only one entry per format (1080 or 720)
                if (!seenFormats.has(quality)) {
                    media.push({
                        url: format.url,
                        format: quality,
                    });
                    seenFormats.add(quality);
                }
            }

            // fallback if no valid formats
            if (media.length === 0 && response.url) {
                media.push({
                    url: response.url,
                    format: 720
                });
            }

            return { status: 'ok', thumbnail, media };
        }

        // --- social-download-all-in-one typical ---
        if (useApi === "socialDownloader") {
            const items = Array.isArray(response.medias)
                ? response.medias
                : Array.isArray(response.data)
                    ? response.data
                    : [response.result || response.data];

            if (response.thumbnail || response.thumb)
                thumbnail = response.thumbnail || response.thumb;

            const seenFormats = new Set();

            for (const item of items) {
                if (item.type === 'video') {
                    let formatValue =
                        item.quality === 'hd_no_watermark'
                            ? 1080
                            : item.quality === 'no_watermark' ||
                                item.quality === 'video mp4 720p' ||
                                item.quality === '720P mp4'
                                ? 720
                                : item.quality;

                    if (!seenFormats.has(formatValue)) {
                        media.push({
                            url: item.url || item.download_url || item.video || null,
                            format: formatValue,
                        });
                        seenFormats.add(formatValue);
                    }
                }
            }

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
