import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const sessionStore = new Map();

function getSession(sessionId) {
    if (!sessionStore.has(sessionId)) {
        sessionStore.set(sessionId, { lastIntent: null, conversationHistory: [] });
    }
    return sessionStore.get(sessionId);
}

// ✅ Multi-intent detection
function detectIntents(message) {
    const lower = message.toLowerCase();
    const intents = [];
    if (/weather|rain|हवामान|पाऊस|तापमान|मौसम|बारिश/.test(lower)) intents.push("WEATHER");
    if (/crop|seed|पीक|बियाणे|पेरणी|sow|plant|लागवड/.test(lower)) intents.push("CROP");
    if (/fertilizer|खत|urea|dap|npk|compost|शेणखत/.test(lower)) intents.push("FERTILIZER");
    if (/pest|कीड|रोग|disease|insect|spray|फवारणी|अळी/.test(lower)) intents.push("PEST");
    return intents;
}

// ✅ NEW: Language enforcement (ONLY FIX)
function enforceLanguage(text, language) {
    if (!text) return text;

    const marathiWords = ["आहे", "करा", "तुम्ही", "शेती", "पीक", "लागवड", "माहिती", "पाणी"];
    const hindiWords = ["है", "करें", "आप", "खेती", "फसल", "लगाना", "पानी"];

    if (language === "Hindi") {
        marathiWords.forEach(word => {
            const regex = new RegExp(word, "g");
            text = text.replace(regex, "");
        });
    }

    if (language === "Marathi") {
        hindiWords.forEach(word => {
            const regex = new RegExp(word, "g");
            text = text.replace(regex, "");
        });
    }

    return text.trim();
}

app.post("/chat", async (req, res) => {
    const { message, language, sessionId = "default" } = req.body;
    const session = getSession(sessionId);

    const detectedIntents = detectIntents(message);
    const resolvedIntents = detectedIntents.length > 0 ? detectedIntents : [session.lastIntent || "CROP"];
    session.lastIntent = resolvedIntents[0];

    // ✅ YOUR ORIGINAL PROMPT (UNCHANGED)
    const systemPrompt = `You are Krishi Mitra, a local agriculture expert from Maharashtra. 

Respond STRICTLY in ${language}.

LANGUAGE STRICT RULE:
- If language is Hindi → use ONLY Hindi words (NO Marathi words)
- If language is Marathi → use ONLY Marathi words (NO Hindi words)
- If language is English → use ONLY English
- NEVER mix languages in a single response
- If unsure, still stick to ${language} only

STRICT RESPONSE RULES:
1. MULTI-QUESTION HANDLING: If the user asks about multiple topics (e.g., crops AND fertilizers), you MUST answer ALL parts of the question.

2. LANGUAGE QUALITY: Use simple, natural, spoken ${language}. Tone must be warm and helpful.

3. RESPONSE STYLE:
   - Write ONLY 1 to 2 short paragraphs.
   - NO bullet points.
   - NO headings.
   - NO emojis.
   - NO markdown.
   - DO NOT show any structured blocks like [PRODUCTS], [END], JSON, or lists.

4. SALES BEHAVIOR:
   - When relevant, recommend 1–2 products naturally inside the paragraph.
   - Mention product name, approximate price, and simple usage in the sentence.

5. STRICT OUTPUT RULE:
   - DO NOT generate structured formats like [PRODUCTS], JSON, etc.

6. CROP & VARIETY RULES:
   Suggest 2 to 4 crops with 1 short reason each. Use ONLY these pairs:
   - Wheat: HD-2967, Lok-1, PBW-621
   - Chickpea: JAKI-9218, Vijay
   - Bajra: PHB-10, Pusa-322
   - Jowar: CSV-15, Maldandi
   - Maize: DHM-117, Bioseed-9681
   - Moong: SML-668 | Urad: LBG-752 | Soybean: JS-335 | Cotton: NHH-44
   - Tomato: Abhinav, Avinash-2 | Bhendi: Arka Anamika | Cucumber: Pusa Uday
   - Groundnut: TAG-24 | Onion: Bhima Super | Garlic: Yamuna Safed

7. FERTILIZER RULES:
   Mention specific names (Urea, DAP, NPK), timing, and simple usage.

8. PRACTICAL TIPS:
   Always include 1 or 2 simple tips on water, soil, or pest control.

Current Topics to address: ${resolvedIntents.join(", ")}`;

    session.conversationHistory.push({ role: "user", content: message });
    if (session.conversationHistory.length > 8) session.conversationHistory.shift();

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "system", content: systemPrompt }, ...session.conversationHistory],
            model: "llama-3.3-70b-versatile",
            temperature: 0.3,
        });

        let botReply = chatCompletion.choices[0]?.message?.content || "";

// Clean unwanted symbols
botReply = botReply.replace(/[*#]/g, "").trim();

// ✅ HARD LANGUAGE CORRECTION USING AI
const correction = await groq.chat.completions.create({
    messages: [
        {
            role: "system",
            content: `Rewrite the following text STRICTLY in ${language}.
Do not change meaning.
Do not add anything.
Do not mix languages.
Only output corrected text.`
        },
        {
            role: "user",
            content: botReply
        }
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0
});

botReply = correction.choices[0]?.message?.content || botReply;

        session.conversationHistory.push({ role: "assistant", content: botReply });

        res.json({ reply: botReply });
    } catch (error) {
        console.error("GROQ ERROR:", error);
        res.status(500).json({ reply: "Technical error. Please try again." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));