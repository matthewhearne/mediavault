// MediaVault — barcode-lookup Edge Function
//
// Looks up a UPC/EAN barcode via UPCitemdb's trial API on the server side.
// UPCitemdb doesn't send CORS headers, so calling it directly from the
// browser fails — this function makes the request server-to-server (where
// CORS doesn't apply) and returns the result with CORS headers of its own,
// so the app's own domain can call it directly.
//
// Deploy with the Supabase CLI:
//   supabase functions deploy barcode-lookup
//
// Call from the app:
//   GET {SUPABASE_URL}/functions/v1/barcode-lookup?upc=036725002058
//   Headers: apikey: <anon/publishable key>, Authorization: Bearer <anon key or user token>

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const UPSTREAM_TIMEOUT_MS = 8000;

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const upc = (url.searchParams.get('upc') || '').trim();

  // UPC-A/UPC-E are 6-12 digits, EAN-8/EAN-13 are 8/13 digits — accept a generous range.
  if (!upc || !/^[0-9]{6,14}$/.test(upc)) {
    return new Response(JSON.stringify({ error: 'Missing or invalid "upc" query parameter' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`,
      { signal: controller.signal },
    );
    const body = await upstream.text();

    // Pass the upstream response straight through — the client already knows how
    // to parse UPCitemdb's { items: [...] } shape.
    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    return new Response(
      JSON.stringify({ error: timedOut ? 'Upstream lookup timed out' : 'Upstream lookup failed' }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
});
