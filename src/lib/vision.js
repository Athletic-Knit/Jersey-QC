// ── The read: one image in, { name, number } out ──────────────────────────────
// Sonnet 5.5 with thinking off, low effort. Measured 20 Oct on 9 frames (2
// clean, 7 with a digit covered by a fold, hand, fabric or the picture edge),
// 5 runs each, through this function:
//   Haiku 4.5              clean 10/10  covered 16/35   0.8 s   $1.66 per 1000
//   Haiku 5.5 thinking     clean 10/10  covered 29/35   4.1 s   $0.47   (medium)
//   Haiku 5.5 no thinking  clean  0/10  covered 35/35   1.2 s   $0.21   (flags every clean jersey)
//   Sonnet 5.5 no thinking clean 10/10  covered 35/35   1.5 s   $4.09   (724 px frame)
// Haiku 4.5 does not see a fold; Haiku 5.5 only sees it while thinking, which
// is slow. Sonnet sees it without thinking. Time is ~1.5 s one at a time at
// an 800 px frame (2.1 s at 1280 px), so the app downscales before sending.
// 21 Oct, edge-case simulation (tools/edge-sim-models.mjs, 13 floor scenarios,
// real frames, today's prompt + matcher): Haiku 5.5 without thinking got
// 130/130 — every fold, hand and cut-off caught, every clean jersey green —
// at a median 1.0 s, the same result as Sonnet 5.5 at 1.9 s and a tenth of
// the price. The order's numbers in the prompt and the matcher rules do the
// work; the bigger model is not needed. Haiku 4.5 misses upside-down numbers.
export const DEFAULT_MODEL = "claude-haiku-5-5";
export const DEFAULT_EFFORT = "low";
export const DEFAULT_THINKING = "off";   // "adaptive" | "off"

export const PROMPT = `This is a quality-control photo from a sports-jersey factory. It usually shows the BACK of a jersey laid flat, but it may show only a loose name plate or number patch lying on the table before it is sewn on. The text may be sideways or upside down: read it as it would read with the jersey the right way up, so an upside-down 40 is "40", never "04", and an upside-down 61 is "61", never "19".
Read these fields:
- "jersey_present": true when a jersey, a name plate or a number patch is in the picture, even folded, bunched, partly out of frame, or so close that only the number and the fabric around it are in view. Any printed name or number in the picture means true, whatever it is printed on. false only when the picture shows no garment and no printed name or number at all — only a table, a mat, a bag, hands, or other objects. When it is false, return "" for name and number.
- "orientation": which way the printed name and number are turned in the picture: "upright" when the letters and digits stand the right way up and read left to right; "upside_down" when they stand on their heads; "rotated_left" when the top of the letters points to the left edge of the picture; "rotated_right" when it points to the right edge. Nearly every jersey is upright: answer anything else only when the lettering is clearly turned.
- "name": the player name, printed in block capitals, if any. Ignore team names, sponsor logos and wordmarks; those are not the player name. In this block lettering, G has a horizontal bar and C does not; O is round and Q has a tail; B is closed and 8 is a digit. Copy the letters exactly as printed, including apostrophes and hyphens.
- "number": the LARGE player number, if any. Jerseys also carry a smaller copy of the same number on each sleeve, and folded sleeves can sit right beside the back number: IGNORE sleeve numbers and never merge them into the back number. Two numbers of different sizes in one picture are two different things: only the LARGEST is the player number. A player number is 1 or 2 digits (00 to 99). Never return 3 or more digits.
- "sleeve_numbers": the small numbers printed on the sleeves or shoulders, exactly as printed, as a list; [] when none are in view.
- "jersey_colour": the main colour of the jersey body, the fabric around the number, in one or two plain words ("black", "white", "red", "navy blue", "forest green", "grey"). Not the colour of the number itself.
- "trim_colour": the second most visible colour on the jersey (stripes, shoulders, number outline), one or two words, or "" if none.
- "obstruction": look closely at the fabric immediately left and right of the digits and around the name before you answer the next fields. At most five words saying what, if anything, covers, overlaps or cuts off the name or number, for example "hand over the right digit", "folded sleeve over the name", "cut off at the top of the picture". "" when nothing does.
- "laid_flat": true when the back of the jersey is fully open and lying flat so the whole name and number area is in plain view. false when the jersey is folded over itself, bunched, crumpled, has a sleeve or another garment lying across its back, or the number area is only partly showing. A folded jersey can hide a whole digit with no visible edge, so be strict: any fold line crossing or touching the number area means false.
- "number_position": where the number you read sits across the width of the jersey back, judged against the jersey's own centre line (midway between its two sleeves), not the centre of the picture: "left", "centre" or "right". A one-digit number whose centre is clearly off that line is "left" or "right".
- "name_complete": true when the whole name is visible from its first letter to its last. false when any letters are covered (a hand, a fold, a tag, another garment), cut off by the edge of the picture, or unreadable, so the "name" you return may be only part of the word. If only part of a name is readable, still return the letters you can read. A short name of two or three letters with open fabric on both sides of it is complete.
- "number_complete": true when every digit of the back number is wholly visible. false when any part of a digit could be covered or cut off (a hand, a fold, a tag, another garment, the edge of the picture). This is about the digits only: the jersey body, sleeves or collar running out of the picture does not matter if the digits themselves are whole. For a single digit, look at the fabric within one digit's width on each side of it: smooth, open fabric on both sides means the number is complete and is that one digit. Return false only when something is actually there — a fold line, a crease, a sleeve, a hand, a tag, a shadow band, or the edge of the picture — or the digit sits clearly to the left or right of the jersey's centre line, which usually means a second digit is hidden.
Return ONLY valid JSON, no markdown, no commentary:
{"jersey_present":true,"orientation":"upright","name":"NAME","number":"##","sleeve_numbers":[],"jersey_colour":"black","trim_colour":"red","obstruction":"","laid_flat":true,"number_position":"centre","name_complete":true,"number_complete":true}
If more than one jersey or plate is in the picture, read the largest or most central one and ignore the others.
Never leave a field empty because you are unsure, and never decide that an item is "only a sample" or "not a real name": whatever letters are printed, return them. A person checks every read against the order, so a near-miss is far more useful than nothing. Do not explain; output the JSON only. Use "" only for a field that is truly not in the picture. A name plate with no number is a valid read: return the name and "" for the number.`;

const str = v => (v === null || v === undefined) ? "" : String(v).trim();

function parseModelText(data) {
  const raw = (data.content || []).map(b => b.text || "").join("").replace(/```json|```/g, "").trim();
  if (!raw) throw new Error(`model returned no text (stop_reason: ${data.stop_reason || "unknown"})`);
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  const body = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  let obj;
  try { obj = JSON.parse(body); } catch { throw new Error(`could not parse model output as JSON: ${raw.slice(0, 120)}`); }
  // The model may hand back a JSON integer; everything downstream wants strings.
  // The completeness fields default to "complete" when the model leaves them
  // out, so an older or terser answer never turns into a false alarm.
  const name = str(obj.name), number = str(obj.number);
  const out = {
    // Absent → present: an older answer never reads as an empty table. And a
    // read with a name or a number in it is never an empty table either, whatever
    // the flag says: hands-free would skip that jersey in silence.
    jersey_present: obj.jersey_present !== false || !!name || !!number,
    orientation: normOrientation(obj.orientation),
    name,
    number,
    sleeve_numbers: Array.isArray(obj.sleeve_numbers) ? obj.sleeve_numbers.map(str).filter(Boolean) : [],
    name_complete: obj.name_complete !== false,
    number_complete: obj.number_complete !== false,
    laid_flat: obj.laid_flat !== false,
    number_position: normPosition(obj.number_position),
    jersey_box: normBox(obj.jersey_box),
    jersey_colour: str(obj.jersey_colour).toLowerCase(),
    trim_colour: str(obj.trim_colour).toLowerCase(),
    obstruction: str(obj.obstruction),
  };
  // The sleeve numbers are reported, not acted on. A one-digit sleeve number
  // beside a two-digit back read looked like a merge, but on the floor it was
  // the "3" of a "30" sleeve cut off by the picture edge, and the doubt it
  // raised put a done #30 on a list with #37 (finding 20). The reader is told
  // in the prompt that two sizes are two numbers; that is where the rule lives.
  return out;
}

// Four fractions [left, top, right, bottom] in 0–1 with a real area, else null.
// Percentages (0–100) are brought down to fractions.
export function normBox(v) {
  if (!Array.isArray(v) || v.length !== 4) return null;
  let b = v.map(Number);
  if (b.some(n => !Number.isFinite(n))) return null;
  if (b.some(n => n > 2)) b = b.map(n => n / 100);   // percentages; a fraction a little over 1 is just clamped
  b = b.map(n => Math.min(1, Math.max(0, n)));
  const [l, t, r, btm] = b;
  if (r - l < 0.05 || btm - t < 0.05) return null;
  return [l, t, r, btm];
}

// "upright" | "upside_down" | "rotated_left" | "rotated_right"; anything else → "" (unknown, treated as upright).
export function normOrientation(v) {
  const s = str(v).toLowerCase().replace(/[\s-]+/g, "_");
  if (/upright|normal|correct/.test(s)) return "upright";   // before "right": "upright" contains it
  if (/upside|inverted|180/.test(s)) return "upside_down";
  if (/left|270|ccw|counter/.test(s)) return "rotated_left";
  if (/right|90|clockwise/.test(s)) return "rotated_right";
  return "";
}

// Degrees to turn the picture clockwise so the jersey reads the right way up.
// The model reads an upright jersey far better than a turned one (6 and 9, 18
// and 81, names), so a turned jersey is turned and read again.
export function uprightRotation(orientation) {
  return orientation === "upside_down" ? 180 : orientation === "rotated_left" ? 90 : orientation === "rotated_right" ? 270 : 0;
}

// "center", "Centre", "middle" → "centre"; "left"/"right" as is; anything else → "".
export function normPosition(v) {
  const s = str(v).toLowerCase();
  if (/cent|middle|mid/.test(s)) return "centre";
  if (/left/.test(s)) return "left";
  if (/right/.test(s)) return "right";
  return "";
}

// Export the parser for tests.
export { parseModelText };

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Calls the Anthropic Messages API through the dev proxy with a timeout and a
 * single retry on network errors / rate limits. Throws with a readable message.
 */
// The order's numbers, as a line for the prompt: with them the model can tell
// that a lone "5" right of centre on an order that has #35 is probably a 35
// with the 3 under a fold — the check a person would make. Kept short.
export function orderNumbersHint(numbers) {
  const list = [...new Set((numbers || []).map(n => String(n ?? "").trim()).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).slice(0, 120);
  if (!list.length) return "";
  return `\nNumbers on this order: ${list.join(", ")}. Read what is printed, never pick from this list — but if the number you read is one digit and a two-digit number on this order contains that digit, look hard at the fabric within one digit's width on each side of the digit. If a fold line, a crease, a sleeve, a hand, a tag or the edge of the picture is there, a second digit may be hidden under it: set number_complete to false and say what is beside the digit in obstruction. If the fabric on both sides is open and smooth, the number is complete: say so. Answer with the JSON object only.`;
}

export async function readJersey({ base64, apiKey, model = DEFAULT_MODEL, effort = DEFAULT_EFFORT, thinking = DEFAULT_THINKING, orderNumbers = null, timeoutMs = 25000, retries = 1, fetchImpl = globalThis.fetch }) {
  const hint = orderNumbersHint(orderNumbers).trim();
  // Current-generation models think before answering (adaptive thinking is on
  // by default) and need room for it; older ones take a plain token cap.
  // thinking "off" turns it off where the model allows: Haiku 5.5 accepts
  // {type:"disabled"} at effort high or below; Sonnet 5.5 uses "between_tools".
  const gen5 = /^claude-(haiku|sonnet|opus|fable)-5/.test(model);
  const off = thinking === "off" && gen5;
  const request = { model, max_tokens: gen5 && !off ? 4000 : 300 };
  if (gen5 && effort) request.output_config = { effort };
  if (off && /^claude-haiku-5/.test(model))  request.thinking = { type: "disabled" };
  if (off && /^claude-sonnet-5/.test(model)) request.thinking = { type: "between_tools" };
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
          ...request,
          // The fixed instructions come first and are cached on the server
          // (cache_control): every scan after the first reads them at a tenth
          // of the input price. The image and the order's numbers follow.
          messages: [{ role: "user", content: [
            { type: "text", text: PROMPT, cache_control: { type: "ephemeral" } },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
            { type: "text", text: (hint || "Read the jersey now.") + (attempt > 0 ? " Reply with ONLY the JSON object, no words before or after it." : "") },
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
      const notJson  = /could not parse model output|returned no text/.test(e.message);   // the model talked instead of answering; ask once more, firmly
      const retryable = timedOut || network || notJson || RETRYABLE.has(e.status);
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
