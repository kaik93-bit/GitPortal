import { auth, db, usernameToEmail } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const form = document.getElementById("login-form");
const errorEl = document.getElementById("error");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const credential = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
    const profileSnap = await getDoc(doc(db, "users", credential.user.uid));

    if (!profileSnap.exists()) {
      await signOut(auth);
      errorEl.textContent = "Kein Benutzerprofil gefunden.";
      return;
    }

    const profile = profileSnap.data();
    const now = new Date();

    if (profile.banned) {
      await signOut(auth);
      errorEl.textContent = "Dieser Account wurde gesperrt.";
      return;
    }

    if (profile.bannedUntil && profile.bannedUntil.toDate() > now) {
      await signOut(auth);
      errorEl.textContent = `Timeout aktiv bis ${profile.bannedUntil.toDate().toLocaleString("de-DE")}.`;
      return;
    }

    window.location.href = "dashboard.html";
  } catch (err) {
    errorEl.textContent = "Benutzername oder Passwort falsch.";
  }
});
