import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 10000;

const ESMS_API_KEY = (process.env.ESMS_API_KEY || "").trim();

const ESMS_SENDER_ID = (process.env.ESMS_SENDER_ID || "").trim();

const ESMS_API_URL =
(
process.env.ESMS_API_URL ||
"https://sms.esmsafrica.io/api/messages/send"
).trim();

// ===============================
// CONFIGURATION
// ===============================

app.use(cors());

app.use(
express.json({
limit: "256kb",
})
);

// ===============================
// PAGE PRINCIPALE
// ===============================

app.get("/", (req, res) => {
res.json({
ok: true,
service: "SUPER VENDOR BOOST - SMS SERVER",
provider: "eSMS Africa",
configured: Boolean(ESMS_API_KEY),
senderConfigured: Boolean(ESMS_SENDER_ID),
endpoint: "/api/send-sms",
});
});

// ===============================
// TEST DE SANTÉ DU SERVEUR
// ===============================

app.get("/health", (req, res) => {
res.json({
ok: true,
configured: Boolean(ESMS_API_KEY),
senderConfigured: Boolean(ESMS_SENDER_ID),
});
});

// ===============================
// NORMALISATION DES NUMÉROS
// ===============================

function normalizePhone(value) {
let phone = String(value || "")
.trim()
.replace(/[^\d+]/g, "");

// Exemple :
// 243812345678
// devient :
// +243812345678

if (phone.startsWith("243")) {
phone = +${phone}`;
}

// Exemple :
// 0812345678
// devient :
// +243812345678

if (phone.startsWith("0")) {
phone = +243${phone.slice(1)}`;
}

return phone;
}

// ===============================
// VALIDATION FORMAT INTERNATIONAL
// ===============================

function isE164(phone) {
return /^+[1-9]\d{7,14}$`/.test(phone);
}

// ===============================
// LECTURE DE LA RÉPONSE eSMS
// ===============================

function parseProviderBody(text) {
try {
return JSON.parse(text);
} catch {
return text;
}
}

// ===============================
// ENVOI SMS
// ===============================

app.post("/api/send-sms", async (req, res) => {
const startedAt = Date.now();

try {

// ---------------------------
// VÉRIFICATION CLÉ API
// ---------------------------

if (!ESMS_API_KEY) {
return res.status(500).json({
ok: false,
error: "ESMS_API_KEY is missing on the server.",
});
}

// ---------------------------
// RÉCUPÉRATION DES DONNÉES
// ---------------------------

const {
message,
recipients,
source,
} = req.body || {};

// ---------------------------
// VALIDATION MESSAGE
// ---------------------------

if (
typeof message !== "string" ||
!message.trim()
) {
return res.status(400).json({
ok: false,
error: "Message SMS manquant.",
});
}

// ---------------------------
// VALIDATION DESTINATAIRES
// ---------------------------

if (
!Array.isArray(recipients) ||
recipients.length === 0
) {
return res.status(400).json({
ok: false,
error: "Aucun destinataire.",
});
}

// ---------------------------
// LIMITE
// ---------------------------

if (recipients.length > 500) {
return res.status(400).json({
ok: false,
error: "Maximum 500 destinataires par requête.",
});
}

// ---------------------------
// NETTOYAGE NUMÉROS
// ---------------------------

const seen = new Set();

const cleaned = [];

for (const item of recipients) {

const phone = normalizePhone(item?.phone);

// Numéro invalide

if (!isE164(phone)) {

cleaned.push({
name: item?.name || "",
phone: item?.phone || "",
normalizedPhone: phone,
valid: false,
error:
"Numéro non valide au format international.",
});

continue;
}

// Éviter les doublons

if (seen.has(phone)) {
continue;
}

seen.add(phone);

cleaned.push({
name: item?.name || "",
phone: item?.phone || "",
normalizedPhone: phone,
valid: true,
});
}

const validRecipients =
cleaned.filter(
(item) => item.valid
);

// ---------------------------
// AUCUN NUMÉRO VALIDE
// ---------------------------

if (validRecipients.length === 0) {

return res.status(400).json({
ok: false,
error: "Aucun numéro valide.",
recipients: cleaned,
});
}

// ===========================
// ENVOI DES SMS
// ===========================

const results = [];

for (const recipient of validRecipients) {

const controller =
new AbortController();

// Timeout de 30 secondes

const timeout =
setTimeout(
() => controller.abort(),
30000
);

// Identifiant de requête

const requestId =
sv-${Date.now()}-${Math.random() .toString(36) .slice(2, 10)};

// Corps de la requête

const body = {

to:
recipient.normalizedPhone,

text:
message.trim(),

};

// Sender ID uniquement
// s'il est configuré

if (ESMS_SENDER_ID) {

body.sender_id =
ESMS_SENDER_ID;

}

try {

// -----------------------
// APPEL eSMS AFRICA
// -----------------------

const providerResponse =
await fetch(
ESMS_API_URL,
{
method: "POST",

headers: {

Authorization:
Bearer${ESMS_API_KEY}`,

"Content-Type":
"application/json",

Accept:
"application/json",

"X-Request-Id":
requestId,
},

body:
JSON.stringify(body),

signal:
controller.signal,
}
);

// -----------------------
// LECTURE RÉPONSE
// -----------------------

const responseText =
await providerResponse.text();

const providerBody =
parseProviderBody(
responseText
);

const providerRequestId =
providerResponse.headers.get(
"x-request-id"
) || null;

const result = {

name:
recipient.name,

phone:
recipient.normalizedPhone,

providerStatus:
providerResponse.status,

providerRequestId,

success:
providerResponse.ok,

response:
providerBody,
};

results.push(result);

// -----------------------
// LOG SERVEUR
// -----------------------

console.log(
JSON.stringify({

event:
"ESMS_RESPONSE",

source:
source || null,

phone:
recipient.normalizedPhone,

status:
providerResponse.status,

requestId:
providerRequestId ||
requestId,

success:
providerResponse.ok,

response:
providerBody,

})
);

} catch (error) {

const isTimeout =
error?.name ===
"AbortError";

const errorMessage =
isTimeout
? "Timeout : eSMS Africa n'a pas répondu dans les 30 secondes."
: Impossible de contacter eSMS Africa : ${
error?.message ||
"Erreur réseau"
}`;

results.push({

name:
recipient.name,

phone:
recipient.normalizedPhone,

success:
false,

networkError:
true,

error:
errorMessage,
});

// -----------------------
// LOG ERREUR RÉSEAU
// -----------------------

console.error(
JSON.stringify({

event:
"ESMS_NETWORK_ERROR",

phone:
recipient.normalizedPhone,

requestId,

error:
errorMessage,

})
);

} finally {

clearTimeout(timeout);

}
}

// ===========================
// RÉSULTATS
// ===========================

const sent =
results.filter(
(item) => item.success
).length;

const failed =
results.length - sent;

const networkErrors =
results.filter(
(item) => item.networkError
).length;

const firstProviderFailure =
results.find(
(item) =>
!item.success &&
!item.networkError
);

// ===========================
// CODE HTTP
// ===========================

let httpStatus = 200;

if (failed > 0) {

// IMPORTANT :
// On retourne maintenant
// le vrai code eSMS Africa.

if (
firstProviderFailure &&
firstProviderFailure.providerStatus
) {

httpStatus =
firstProviderFailure.providerStatus;

} else if (
networkErrors > 0
) {

// Impossible de joindre eSMS

httpStatus = 502;

} else {

httpStatus = 502;

}
}

// ===========================
// MESSAGE EXPLICATIF
// ===========================

let hint = null;

if (
firstProviderFailure?.providerStatus ===
400
) {

hint =
"eSMS Africa considère le numéro ou les données envoyées comme invalides.";

}

else if (
firstProviderFailure?.providerStatus ===
401
) {

hint =
"Clé API eSMS Africa invalide ou absente.";

}

else if (
firstProviderFailure?.providerStatus ===
402
) {

hint =
"Solde eSMS Africa insuffisant. Une clé esms_test_ peut être utilisée pour tester sans débit.";

}

else if (
firstProviderFailure?.providerStatus ===
403
) {

hint =
"Requête refusée par eSMS Africa : vérifie les permissions ou le Sender ID.";

}

else if (
firstProviderFailure?.providerStatus ===
409
) {

hint =
"Message identique vers le même numéro déjà envoyé dans les 5 dernières minutes.";

}

else if (
networkErrors > 0
) {

hint =
"Le serveur Render n'a pas reçu de réponse d'eSMS Africa.";

}

// ===========================
// RÉPONSE FINALE
// ===========================

return res.status(httpStatus).json({

ok:
sent > 0 &&
failed === 0,

sent,

failed,

total:
results.length,

networkErrors,

elapsedMs:
Date.now() - startedAt,

results,

hint,

});

} catch (error) {

// ===========================
// ERREUR SERVEUR
// ===========================

console.error(
"SERVER_ERROR",
error
);

return res.status(500).json({

ok: false,

error:
error?.message ||
"Erreur interne du serveur.",

});
}
});

// ===============================
// DÉMARRAGE SERVEUR
// ===============================

app.listen(
PORT,
"0.0.0.0",
() => {

console.log(
SMS server running on port${PORT}`
);

console.log(
eSMS API URL: ${ESMS_API_URL}`
);

console.log(
eSMS sender configured:${Boolean(
ESMS_SENDER_ID
)}`
);

console.log(
eSMS API key configured: ${Boolean( ESMS_API_KEY )}
);

}
);
