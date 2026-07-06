import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDN3ihssUsH2IMZQ9yfYYMzEX4CUB6g8KU",
  authDomain: "gitportal.firebaseapp.com",
  projectId: "gitportal",
  storageBucket: "gitportal.firebasestorage.app",
  messagingSenderId: "941544909825",
  appId: "1:941544909825:web:a8fd511fa461d6d2d9a400"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const EMAIL_DOMAIN = "gitportal.app";

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}
