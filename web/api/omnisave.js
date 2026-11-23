const API_BASE = 'https://h5-api.aoneroom.com/wefeed-h5api-bff/';
const WEB_ORIGIN = 'https://videodownloader.site';

function respond(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function normalizeTitle(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function readJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new Error('OmniSave returned an unreadable response.'); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed.' });

  const body = req.body || {};
  const title = String(body.title || '').trim().slice(0, 180);
  const mediaType = body.mediaType === 'tv' ? 'tv' : 'movie';
  const year = String(body.year || '').slice(0, 4);
  const season = Math.max(1, Math.min(99, Number(body.season) || 1));
  const episode = Math.max(1, Math.min(999, Number(body.episode) || 1));
  if (!title) return respond(res, 400, { error: 'A title is required.' });

  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-source': 'downloader',
    'x-request-lang': 'en',
    origin: WEB_ORIGIN,
    referer: WEB_ORIGIN + '/',
  };

  try {
    // Mint a guest token using the provider's documented public bootstrap flow.
    const bootstrap = await fetch(API_BASE + 'subject/search-suggest', {
      method: 'POST',
      headers,
      body: JSON.stringify({ keyword: 'a', perPage: 5 }),
    });
    if (!bootstrap.ok) throw new Error('OmniSave authentication is currently unavailable.');
    const tokenHeader = bootstrap.headers.get('x-user');
    let guestToken = '';
    try { guestToken = JSON.parse(tokenHeader || '{}').token || ''; } catch {}
    if (!guestToken) throw new Error('OmniSave did not issue a guest session.');

    const authHeaders = { ...headers, authorization: 'Bearer ' + guestToken };
    const searchResponse = await fetch(API_BASE + 'subject/search', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ keyword: title, page: 1, perPage: 20, subjectType: 0 }),
    });
    if (!searchResponse.ok) throw new Error('OmniSave title search failed.');
    const searchData = await readJson(searchResponse);
    const items = Array.isArray(searchData?.data?.items) ? searchData.data.items : [];
    const usable = items.filter((item) => item?.hasResource && item?.subjectId && item?.detailPath);
    const typeMatches = usable.filter((item) => mediaType === 'tv' ? Number(item.subjectType) !== 1 : Number(item.subjectType) === 1);
    const candidates = typeMatches.length ? typeMatches : usable;
    const wantedTitle = normalizeTitle(title);
    candidates.sort((a, b) => {
      const score = (item) => {
        const itemTitle = normalizeTitle(item.title);
        const exact = itemTitle === wantedTitle ? 100 : (itemTitle.includes(wantedTitle) || wantedTitle.includes(itemTitle) ? 50 : 0);
        const itemYear = String(item.releaseDate || '').slice(0, 4);
        return exact + (year && itemYear === year ? 20 : 0);
      };
      return score(b) - score(a);
    });

    for (const item of candidates) {
      const params = new URLSearchParams({
        subjectId: String(item.subjectId),
        detailPath: String(item.detailPath),
        se: mediaType === 'tv' ? String(season) : '0',
        ep: mediaType === 'tv' ? String(episode) : '0',
        'supportCodecs[h264]': '1',
      });
      // Only use the download endpoint and only streams explicitly marked non-VIP.
      const downloadResponse = await fetch(API_BASE + 'subject/download?' + params.toString(), {
        method: 'GET',
        headers: authHeaders,
      });
      if (!downloadResponse.ok) continue;
      const downloadData = await readJson(downloadResponse);
      const available = (downloadData?.data?.downloads || [])
        .filter((entry) => entry && entry.vipLocked !== true && typeof entry.url === 'string' && /^https:\/\//i.test(entry.url))
        .sort((a, b) => Number(b.resolution || 0) - Number(a.resolution || 0));
      const stream = available[0];
      if (stream) {
        return respond(res, 200, {
          url: stream.url,
          resolution: Number(stream.resolution) || 0,
          format: stream.format || 'MP4',
          title: item.title || title,
        });
      }
    }

    return respond(res, 404, { error: 'No non-VIP OmniSave stream was found for this title or episode.' });
  } catch (error) {
    return respond(res, 502, { error: error?.message || 'OmniSave could not resolve this title.' });
  }
}
