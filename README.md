# Serveur SMS — SUPER VENDOR BOOST

Serveur Node.js intermédiaire entre l'application HTML et eSMS Africa.

## Fichiers

- `server.js` : API `/api/send-sms`
- `package.json` : dépendances
- `.env.example` : variables à configurer
- `.gitignore` : protège `.env`

## Variables

`ESMS_API_KEY` : clé API eSMS Africa. Ne jamais la mettre dans le HTML.

`ESMS_SENDER_ID` : Sender ID approuvé par le fournisseur.

`ESMS_API_URL` : endpoint SMS.

## Lancer localement

```bash
npm install
npm start
```

## Tester

Ouvrir :

`http://localhost:10000/health`

Puis configurer dans l'application l'URL :

`http://localhost:10000/api/send-sms`

En production, utiliser l'URL HTTPS fournie par Render.

## Format reçu

POST `/api/send-sms`

```json
{
  "message": "Bonjour",
  "recipients": [
    {"name": "Vendor 1", "phone": "2438XXXXXXXXX"},
    {"name": "Vendor 2", "phone": "2438XXXXXXXXX"}
  ]
}
```

Le serveur normalise les numéros RDC au format `+243...`, supprime les doublons et renvoie le nombre de SMS envoyés/échoués.
