import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-client-token, x-client-id");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const PORT = Number(process.env.PORT || 3001);
// If you want to hardcode locally, paste the key below and leave env empty.
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
// Example: const GROQ_API_KEY = "gsk_your_key_here";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const MODEL = process.env.MODEL || "llama-3.1-8b-instant";
const CLIENT_TOKEN = process.env.CLIENT_TOKEN || "";

const clientStates = new Map();
const RATE_WINDOW_MS = 1000;
const MAX_REQ_PER_WINDOW = 4;

if (!GROQ_API_KEY) {
  console.warn("Missing GROQ_API_KEY. Set it in your environment.");
}

app.get("/health", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({ ok: true, model: MODEL });
});

app.post("/decide", async (req, res) => {
  try {
    if (CLIENT_TOKEN) {
      const token = req.headers["x-client-token"];
      if (token !== CLIENT_TOKEN) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
    }

    const clientId =
      (req.headers["x-client-id"] || req.body?.clientId || req.ip || "unknown") + "";
    const now = Date.now();
    const cState = clientStates.get(clientId) || {
      lastWindowStart: now,
      reqCount: 0,
      lastAction: null
    };
    if (now - cState.lastWindowStart > RATE_WINDOW_MS) {
      cState.lastWindowStart = now;
      cState.reqCount = 0;
    }
    cState.reqCount += 1;
    if (cState.reqCount > MAX_REQ_PER_WINDOW) {
      clientStates.set(clientId, cState);
      return res.status(429).json({
        ok: false,
        error: "Rate limit",
        action: cState.lastAction || null
      });
    }

    const state = req.body || {};
    const action = await getBotAction(state);
    cState.lastAction = action;
    clientStates.set(clientId, cState);
    res.json({ ok: true, action });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

async function getBotAction(state) {
  const systemPrompt = [
    "You are a realtime enemy AI for a shooter game.",
    "Decide the next short action for a bot using the given state.",
    "Return ONLY valid minified JSON with this schema:",
    '{ "move": { "x": -1..1, "z": -1..1 }, "aim": { "x": -1..1, "y": -1..1, "z": -1..1 }, "shoot": true|false, "sprint": true|false, "jump": true|false, "target": "player"|"none" }',
    "Guidelines:",
    "- prefer smooth movement, no jitter",
    "- if player visible and in range, aim and shoot",
    "- if low HP, prefer sprint and reposition",
    "- if target not visible, move toward last known position if provided"
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      tick: Date.now(),
      state
    },
    null,
    0
  );

  const body = {
    model: MODEL,
    temperature: 0.4,
    max_tokens: 120,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  const resp = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Groq error: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "{}";
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }
  return sanitizeAction(parsed);
}

function clamp(n, min, max) {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  return Math.max(min, Math.min(max, n));
}

function sanitizeAction(action) {
  const move = action?.move || {};
  const aim = action?.aim || {};
  return {
    move: {
      x: clamp(move.x, -1, 1),
      z: clamp(move.z, -1, 1)
    },
    aim: {
      x: clamp(aim.x, -1, 1),
      y: clamp(aim.y, -1, 1),
      z: clamp(aim.z, -1, 1)
    },
    shoot: Boolean(action?.shoot),
    sprint: Boolean(action?.sprint),
    jump: Boolean(action?.jump),
    target: action?.target === "player" ? "player" : "none"
  };
}

app.listen(PORT, () => {
  console.log(`AI runtime server listening on http://localhost:${PORT}`);
});
