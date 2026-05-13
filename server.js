// server.js - Backend avec Express.js
const express = require('express');
const axios = require('axios');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ==================== CONFIGURATION ====================

// Liste des emails abonnés (sauvegardée en JSON)
const SUBSCRIBERS_FILE = 'subscribers.json';
const STATUS_CHECK_INTERVAL = 5 * 60 * 1000; // Vérifier toutes les 5 minutes
const TARGET_VERSION = '4.8';

// Configuration email (Gmail)
const MAIL_CONFIG = {
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'your-app-password', // Générée via Google
  }
};

let currentVersion = null;
let lastNotifiedVersion = null;

// ==================== FONCTIONS UTILITAIRES ====================

function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Erreur lecture subscribers:', e);
  }
  return [];
}

function saveSubscribers(subscribers) {
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
}

async function getStarCitizenVersion() {
  try {
    const response = await axios.get(
      'https://status.robertsspaceindustries.com/api/v2/status.json',
      { timeout: 10000 }
    );
    
    if (response.data.data && response.data.data.starCitizen) {
      return response.data.data.starCitizen.version;
    }
  } catch (error) {
    console.error('Erreur récupération version:', error.message);
  }
  return null;
}

async function sendEmailNotification(subscribers, version) {
  try {
    const transporter = nodemailer.createTransport(MAIL_CONFIG);
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; color: white; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="margin: 0;">🎉 Star Citizen ${version} EST DISPONIBLE!</h1>
        </div>
        <div style="background: #f5f5f5; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px;">Bonjour,</p>
          <p style="font-size: 16px;">Star Citizen <strong>${version}</strong> vient d'être publié!</p>
          <p style="font-size: 16px;">Votre launcher Star Citizen devrait afficher la mise à jour.</p>
          
          <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea;">
            <p style="margin: 0;"><strong>Version:</strong> ${version}</p>
            <p style="margin: 0;"><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</p>
          </div>
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="https://www.robertsspaceindustries.com" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Lancer Star Citizen</a>
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          
          <p style="font-size: 12px; color: #666;">
            Vous avez reçu cet email car vous êtes inscrit au service de notifications Star Citizen 4.8.
            <a href="UNSUBSCRIBE_LINK" style="color: #667eea;">Se désabonner</a>
          </p>
        </div>
      </div>
    `;

    const mailPromises = subscribers.map(email =>
      transporter.sendMail({
        from: MAIL_CONFIG.auth.user,
        to: email,
        subject: `✨ Star Citizen ${version} Disponible!`,
        html: htmlContent,
      })
    );

    await Promise.all(mailPromises);
    console.log(`✓ ${subscribers.length} emails envoyés pour version ${version}`);
    return true;
  } catch (error) {
    console.error('Erreur envoi email:', error.message);
    return false;
  }
}

function generateRSSFeed() {
  const now = new Date().toISOString();
  
  let items = '';
  if (currentVersion && currentVersion.includes(TARGET_VERSION)) {
    items = `
    <item>
      <title>Star Citizen ${currentVersion} Disponible!</title>
      <description>Star Citizen ${currentVersion} vient d'être publié. Version cible atteinte!</description>
      <pubDate>${now}</pubDate>
      <guid>star-citizen-${currentVersion}</guid>
      <link>https://www.robertsspaceindustries.com</link>
    </item>`;
  } else {
    items = `
    <item>
      <title>Surveillance Star Citizen 4.8</title>
      <description>Version actuelle: ${currentVersion || 'Vérification...'}</description>
      <pubDate>${now}</pubDate>
      <guid>star-citizen-check-${Date.now()}</guid>
    </item>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Star Citizen 4.8 - Notifications</title>
    <link>http://localhost:3000</link>
    <description>Soyez notifié quand Star Citizen 4.8 est disponible</description>
    <language>fr-fr</language>
    <lastBuildDate>${now}</lastBuildDate>
    ${items}
  </channel>
</rss>`;
}

// ==================== ROUTES HTTP ====================

// Afficher la page d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Flux RSS
app.get('/rss', (req, res) => {
  res.type('application/rss+xml');
  res.send(generateRSSFeed());
});

// S'abonner par email
app.post('/subscribe', (req, res) => {
  const { email } = req.body;

  // Validation email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  let subscribers = loadSubscribers();

  // Vérifier si déjà abonné
  if (subscribers.includes(email)) {
    return res.status(400).json({ error: 'Déjà inscrit' });
  }

  subscribers.push(email);
  saveSubscribers(subscribers);

  res.json({ 
    success: true, 
    message: `${email} s'est inscrit au flux RSS`,
    subscribers: subscribers.length
  });
});

// Se désabonner
app.post('/unsubscribe', (req, res) => {
  const { email } = req.body;
  
  let subscribers = loadSubscribers();
  subscribers = subscribers.filter(e => e !== email);
  saveSubscribers(subscribers);

  res.json({ 
    success: true, 
    message: 'Vous vous êtes désabonné'
  });
});

// Récupérer la version actuelle
app.get('/api/version', (req, res) => {
  res.json({ 
    version: currentVersion,
    target: TARGET_VERSION,
    isAvailable: currentVersion ? currentVersion.includes(TARGET_VERSION) : false,
    lastCheck: new Date()
  });
});

// Récupérer les stats
app.get('/api/stats', (req, res) => {
  const subscribers = loadSubscribers();
  res.json({
    subscribers: subscribers.length,
    currentVersion,
    targetVersion: TARGET_VERSION,
    isAvailable: currentVersion ? currentVersion.includes(TARGET_VERSION) : false
  });
});

// ==================== SURVEILLANCE AUTOMATIQUE ====================

async function monitorStarCitizen() {
  const version = await getStarCitizenVersion();
  
  if (version) {
    console.log(`[${new Date().toLocaleTimeString()}] Version: ${version}`);
    currentVersion = version;

    // Vérifie si c'est la version cible et pas encore notifiée
    if (version.includes(TARGET_VERSION) && version !== lastNotifiedVersion) {
      console.log(`🎉 Version ${version} détectée!`);
      const subscribers = loadSubscribers();
      
      if (subscribers.length > 0) {
        await sendEmailNotification(subscribers, version);
        lastNotifiedVersion = version;
      }
    }
  }
}

// Vérifier au démarrage
monitorStarCitizen();

// Puis toutes les 5 minutes
setInterval(monitorStarCitizen, STATUS_CHECK_INTERVAL);

// ==================== DÉMARRAGE SERVEUR ====================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║  Star Citizen Monitor Server       ║
║  Serveur lancé sur le port ${PORT}    ║
╚════════════════════════════════════╝
  RSS: http://localhost:${PORT}/rss
  Site: http://localhost:${PORT}
  `);
});
