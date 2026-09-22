import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "256kb" }));

const ESMS_API_URL =
  process.env.ESMS_API_URL ||
  "https://sms.esmsafrica.io/api/messages/send";

const ESMS_API_KEY = process.env.ESMS_API_KEY || "";
const ESMS_SENDER_ID = process.env.ESMS_SENDER_ID || "";

function cleanPhone(value) {
  let p = String(value || "").trim().replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (/^243\d{9}$/.test(p)) p = "+" + p;
  return p;
}

function cleanRecipients(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const result = [];

  for (const item of input) {
    const phone = cleanPhone(item?.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    result.push({
      name: String(item?.name || "").trim(),
      phone
    });
  }
  return result;
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "SUPER VENDOR BOOST - SMS API",
    provider: "eSMS Africa",
    endpoint: "/api/send-sms"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(ESMS_API_KEY && ESMS_SENDER_ID)
  });
});

app.post("/api/send-sms", async (req, res) => {
  if (!ESMS_API_KEY) {
    return res.status(500).json({
      ok: false,
      message: "ESMS_API_KEY n'est pas configurée sur le serveur."
    });
  }

  if (!ESMS_SENDER_ID) {
    return res.status(500).json({
      ok: false,
      message: "ESMS_SENDER_ID n'est pas configuré sur le serveur."
    });
  }

  const message = String(req.body?.message || "").trim();
  const recipients = cleanRecipients(req.body?.recipients);

  if (!message) {
    return res.status(400).json({
      ok: false,
      message: "Le message est obligatoire."
    });
  }

  if (!recipients.length) {
    return res.status(400).json({
      ok: false,
      message: "Aucun destinataire valide."
    });
  }

  // Protection simple contre des requêtes accidentelles énormes.
  const MAX_RECIPIENTS_PER_REQUEST = 500;
  if (recipients.length > MAX_RECIPIENTS_PER_REQUEST) {
    return res.status(400).json({
      ok: false,
      message: `Maximum ${MAX_RECIPIENTS_PER_REQUEST} destinataires par requête.`
    });
  }

  let sent = 0;
  let failed = 0;
  const results = [];

  // eSMS Africa documente actuellement un endpoint d'envoi unitaire.
  // On envoie donc un SMS par destinataire et on garde le résultat de chacun.
  for (const recipient of recipients) {
    try {
      const payload = {
        to: recipient.phone,
        text: message,
        sender_id: ESMS_SENDER_ID
      };

      const response = await fetch(ESMS_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ESMS_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }

      if (!response.ok) {
        failed++;
        results.push({
          name: recipient.name,
          phone: recipient.phone,
          status: "failed",
          providerStatus: response.status,
          error: data?.message || data?.error || raw || "Erreur fournisseur SMS"
        });
      } else {
        sent++;
        results.push({
          name: recipient.name,
          phone: recipient.phone,
          status: "sent",
          provider: data
        });
      }
    } catch (error) {
      failed++;
      results.push({
        name: recipient.name,
        phone: recipient.phone,
        status: "failed",
        error: error?.message || "Erreur réseau"
      });
    }
  }

  return res.status(failed && sent === 0 ? 502 : 200).json({
    ok: sent > 0,
    sent,
    failed,
    total: recipients.length,
    results
  });
});

app.listen(PORT, () => {
  console.log(`SMS server running on port ${PORT}`);
});
