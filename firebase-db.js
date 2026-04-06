// Firebase DB (Usando Firebase v10 Compat per supporto immediato su file:// locale)

// ==========================================
// 🔴 INSERISCI QUI I TUOI DATI FIREBASE 🔴
// ==========================================
window.firebaseConfig = {
  apiKey: "AIzaSyBhxYec74MB6cd4rgMZe46boUajo5FiXlY",
  authDomain: "ristoro-99403.firebaseapp.com",
  projectId: "ristoro-99403",
  storageBucket: "ristoro-99403.firebasestorage.app",
  messagingSenderId: "365616992371",
  appId: "1:365616992371:web:f56c94437dc0dcc5e99a06",
  measurementId: "G-X2CRYNPEHQ"
};

// ==========================================
// LOGICA DI FALLBACK (Per test locale)
// ==========================================
const isConfigured = window.firebaseConfig.apiKey !== "YOUR_API_KEY";
let db = null;

if (isConfigured) {
  firebase.initializeApp(window.firebaseConfig);
  db = firebase.firestore();
  console.log("🔥 Firebase Inizializzato correttamente!");
} else {
  console.warn("⚠️ Firebase NON configurato. Usiamo il LocalStorage!");
}

// Interfaccia Database Esportata a livello Globale (window.DB)
window.DB = {
  async getPlaces(type) {
    if (isConfigured) {
      const querySnapshot = await db.collection(type).get();
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else {
      return JSON.parse(localStorage.getItem(`tecnosistem_places_${type}`) || '[]');
    }
  },

  async addPlace(type, data) {
    if (isConfigured) {
      const docRef = await db.collection(type).add(data);
      return docRef.id;
    } else {
      const places = await this.getPlaces(type);
      const newPlace = { id: Date.now().toString(), ...data };
      places.push(newPlace);
      localStorage.setItem(`tecnosistem_places_${type}`, JSON.stringify(places));
      return newPlace.id;
    }
  },

  async deletePlace(type, id) {
    if (isConfigured) {
      await db.collection(type).doc(id).delete();
    } else {
      let places = await this.getPlaces(type);
      places = places.filter(p => p.id !== id);
      localStorage.setItem(`tecnosistem_places_${type}`, JSON.stringify(places));
    }
  },

  async updatePlace(type, id, data) {
    if (isConfigured) {
      await db.collection(type).doc(id).update(data);
    } else {
      let places = await this.getPlaces(type);
      places = places.map(p => p.id === id ? { ...p, ...data } : p);
      localStorage.setItem(`tecnosistem_places_${type}`, JSON.stringify(places));
    }
  }
};
