// ── The read: one image in, { name, number } out ──────────────────────────────
export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export const PROMPT = `This is a photo of the BACK of a sports jersey laid flat, taken for quality control in a factory.
Read these fields:
- "name": the player name printed across the upper back, if any. Ignore team names, sponsor logos and wordmarks; those are not the player name.
- "number": the LARGE number centred on the back. Jerseys also carry a smaller copy of the same number on each sleeve, and folded sleeves can sit right beside the back number: IGNORE sleeve numbers. A back number is 1 or 2 digits (00 to 99). Never return 3 or more digits.
- "sleeve_numbers": any numbers you can see on the sleeves, as a list, so they are not confused with the back number.
Return ONLY valid JSON, no markdown, no commentary:
{"name":"NAME","number":"##","sleeve_numbers":["##"]}
Use "" for a field that is not visible.`;

const str = v => (v === null || v === undefined) ? "" : String(v).trim();

function parseModelText(data) {
  const raw = (data.content || []).map(b => b.text || "").join("").replace(/```json|```/g, "").trim();
  if (!raw) throw new Error(`model returned no text (stop_reason: ${data.stop_reason || "unknown"})`);
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  const body = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  let obj;
  try { obj = JSON.parse(body); } catch { throw new Error(`could not parse model output as JSON: ${raw.slice(0, 120)}`); }
  // The model may hand back a JSON integer; everything downstream wants strings.
  return {
    name: str(obj.name),
    number: str(obj.number),
    sleeve_numbers: Array.isArray(obj.sleeve_numbers) ? obj.sleeve_numbers.map(str).filter(Boolean) : [],
  };
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Calls the Anthropic Messages API through the dev proxy with a timeout and a
 * single retry on network errors / rate limits. Throws with a readable message.
 */
export async function readJersey({ base64, apiKey, model = DEFAULT_MODEL, timeoutMs = 25000, retries = 1, fetchImpl = globalThis.fetch }) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const resp = await fetchImpl("/api/anthropic/v1/messages", {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey || "",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model, max_tokens: 200,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
            { type: "text", text: PROMPT },
          ] }],
        }),
      });
      // Read as text first: error bodies and empty bodies are not valid JSON.
      const bodyText = await resp.text();
      let data;
      try { data = JSON.parse(bodyText); }
      catch { throw Object.assign(new Error(`HTTP ${resp.status} — server did not return JSON: ${bodyText.slice(0, 200) || "(empty response)"}`), { status: resp.status }); }
      if (!resp.ok || data.type === "error") {
        const err = data.error || {};
        throw Object.assign(new Error(`HTTP ${resp.status} ${err.type || "error"} — ${err.message || bodyText.slice(0, 200)}`), { status: resp.status });
      }
      const detected = parseModelText(data);
      return { ...detected, usage: data.usage || null };
    } catch (e) {
      lastErr = e;
      const timedOut = e.name === "AbortError";
      const network  = e instanceof TypeError;               // fetch() itself failed
      const retryable = timedOut || network || RETRYABLE.has(e.status);
      if (timedOut) lastErr = new Error(`no answer after ${Math.round(timeoutMs / 1000)} s — check the network`);
      if (network)  lastErr = new Error("could not reach the server — is it running, and is the network up?");
      if (!retryable || attempt === retries) break;
      await sleep(1500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
