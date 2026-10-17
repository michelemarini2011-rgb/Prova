// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAZIONE — è l'unico file da modificare (oltre a firestore.rules).
//
// 1. Nella console di Firebase apri Impostazioni progetto → Generali → "Le tue app"
//    → aggiungi un'app Web (icona </>) e copia qui sotto i valori di firebaseConfig.
// 2. In adminEmails metti la tua email: con quell'account vedrai il pannello
//    "Statistiche" e potrai caricare i capitoli. Usa la stessa email anche in
//    firestore.rules, che è ciò che protegge davvero i dati.
//
// Questi valori non sono segreti: è normale che siano visibili nel sito.
// ─────────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: 'INSERISCI-QUI',
  authDomain: 'il-tuo-progetto.firebaseapp.com',
  projectId: 'il-tuo-progetto',
  storageBucket: 'il-tuo-progetto.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000',
};

export const adminEmails = ['tua-email@example.com'];
