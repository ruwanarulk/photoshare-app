// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD5oxOYvylCPbBbXoTfHh3kIqToGGnddTg",
  authDomain: "photoshare-afbee.firebaseapp.com",
  projectId: "photoshare-afbee",
  storageBucket: "photoshare-afbee.firebasestorage.app",
  messagingSenderId: "91303472070",
  appId: "1:91303472070:web:f9dbd5c22ad119c618e0c7",
  measurementId: "G-MLX6FWQP1G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, analytics, auth, db };
