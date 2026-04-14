import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAzx8y9o4LnqaQZo16iLos7HSNMXMgAJl0",
  authDomain: "village-banking-system.firebaseapp.com",
  projectId: "village-banking-system",
  storageBucket: "village-banking-system.firebasestorage.app",
  messagingSenderId: "303178657724",
  appId: "1:303178657724:web:e92c9ab0ce814233f505b9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
