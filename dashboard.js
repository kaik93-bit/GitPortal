import { auth, db, firebaseConfig, usernameToEmail } from "./firebase-config.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  onAuthStateChanged,
  signOut,
  getAuth,
  createUserWithEmailAndPassword,
  signOut as signOutSecondary,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const welcomeName = document.getElementById("welcome-name");
const logoutBtn = document.getElementById("logout-btn");
const adminPanel = document.getElementById("admin-panel");
const addUserForm = document.getElementById("add-user-form");
const addUserError = document.getElementById("add-user-error");
const userTableBody = document.getElementById("user-table-body");

let currentUid = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const profileSnap = await getDoc(doc(db, "users", user.uid));

  if (!profileSnap.exists()) {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  const profile = profileSnap.data();
  const now = new Date();

  if (profile.banned || (profile.bannedUntil && profile.bannedUntil.toDate() > now)) {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  currentUid = user.uid;
  welcomeName.textContent = profile.username;

  if (profile.canManageUsers) {
    adminPanel.hidden = false;
    watchUsers();
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

function watchUsers() {
  onSnapshot(collection(db, "users"), (snapshot) => {
    userTableBody.innerHTML = "";
    snapshot.forEach((docSnap) => {
      userTableBody.appendChild(renderUserRow(docSnap.id, docSnap.data()));
    });
  });
}

function renderUserRow(uid, data) {
  const row = document.createElement("tr");

  const now = new Date();
  let status = "Aktiv";
  if (data.banned) {
    status = "Gesperrt";
  } else if (data.bannedUntil && data.bannedUntil.toDate() > now) {
    status = `Timeout bis ${data.bannedUntil.toDate().toLocaleString("de-DE")}`;
  }

  row.innerHTML = `
    <td>${data.username}</td>
    <td>${data.role}</td>
    <td>${status}</td>
    <td><input type="checkbox" data-action="toggle-manage" ${data.canManageUsers ? "checked" : ""}></td>
    <td>
      <button data-action="ban">${data.banned ? "Entsperren" : "Sperren"}</button>
      <button data-action="timeout">Timeout</button>
      <button data-action="remove">Entfernen</button>
    </td>
  `;

  row.querySelector('[data-action="toggle-manage"]').addEventListener("change", (e) => {
    updateDoc(doc(db, "users", uid), { canManageUsers: e.target.checked });
  });

  row.querySelector('[data-action="ban"]').addEventListener("click", () => {
    updateDoc(doc(db, "users", uid), { banned: !data.banned });
  });

  row.querySelector('[data-action="timeout"]').addEventListener("click", () => {
    const minutes = prompt("Timeout-Dauer in Minuten:", "10");
    if (!minutes || isNaN(minutes)) return;
    const until = new Date(Date.now() + Number(minutes) * 60000);
    updateDoc(doc(db, "users", uid), { bannedUntil: Timestamp.fromDate(until) });
  });

  row.querySelector('[data-action="remove"]').addEventListener("click", () => {
    if (uid === currentUid) {
      alert("Du kannst dich nicht selbst entfernen.");
      return;
    }
    if (confirm(`Benutzer "${data.username}" wirklich entfernen?`)) {
      deleteDoc(doc(db, "users", uid));
    }
  });

  return row;
}

addUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  addUserError.textContent = "";

  const username = document.getElementById("new-username").value;
  const password = document.getElementById("new-password").value;
  const role = document.getElementById("new-role").value;
  const canManageUsers = document.getElementById("new-can-manage").checked;

  const secondaryApp = initializeApp(firebaseConfig, `Secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, usernameToEmail(username), password);

    await setDoc(doc(db, "users", credential.user.uid), {
      username: username.trim(),
      role,
      canManageUsers,
      banned: false,
      bannedUntil: null,
      createdAt: serverTimestamp(),
    });

    addUserForm.reset();
  } catch (err) {
    addUserError.textContent = "Fehler beim Erstellen des Nutzers (Benutzername evtl. vergeben, Passwort min. 6 Zeichen).";
  } finally {
    await signOutSecondary(secondaryAuth);
    await deleteApp(secondaryApp);
  }
});
