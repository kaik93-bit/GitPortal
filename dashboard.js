import { auth, db, firebaseConfig, usernameToEmail } from "./firebase-config.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  onAuthStateChanged,
  signOut,
  getAuth,
  createUserWithEmailAndPassword,
  signOut as signOutSecondary,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
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
const adminBtn = document.getElementById("admin-btn");
const addUserForm = document.getElementById("add-user-form");
const addUserError = document.getElementById("add-user-error");
const userTableBody = document.getElementById("user-table-body");
const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");
const themeButtons = document.querySelectorAll(".theme-btn");
const volumeRange = document.getElementById("volume-range");
const volumeValue = document.getElementById("volume-value");
const passwordForm = document.getElementById("password-form");
const passwordMessage = document.getElementById("password-message");

let currentUid = null;

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("gitportal-theme", theme);
  themeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeChoice === theme);
  });
}

applyTheme(localStorage.getItem("gitportal-theme") || "cyberpunk");

themeButtons.forEach((btn) => {
  btn.addEventListener("click", () => applyTheme(btn.dataset.themeChoice));
});

const savedVolume = localStorage.getItem("gitportal-volume") || "50";
volumeRange.value = savedVolume;
volumeValue.textContent = savedVolume;

volumeRange.addEventListener("input", () => {
  volumeValue.textContent = volumeRange.value;
  localStorage.setItem("gitportal-volume", volumeRange.value);
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  passwordMessage.textContent = "";

  const currentPassword = document.getElementById("current-password").value;
  const newPassword = document.getElementById("new-password-field").value;
  const confirmPassword = document.getElementById("confirm-password").value;

  if (newPassword !== confirmPassword) {
    passwordMessage.textContent = "Die neuen Passwörter stimmen nicht überein.";
    return;
  }

  try {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updatePassword(auth.currentUser, newPassword);
    passwordMessage.classList.remove("error");
    passwordMessage.classList.add("success");
    passwordMessage.textContent = "Passwort erfolgreich geändert.";
    passwordForm.reset();
  } catch (err) {
    passwordMessage.classList.remove("success");
    passwordMessage.classList.add("error");
    passwordMessage.textContent = "Aktuelles Passwort falsch oder Fehler beim Ändern.";
  }
});

function showPage(pageName) {
  pages.forEach((page) => {
    page.hidden = page.id !== `page-${pageName}`;
  });
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageName);
  });
}

navItems.forEach((item) => {
  item.addEventListener("click", () => showPage(item.dataset.page));
});

adminBtn.addEventListener("click", () => showPage("admin"));

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
    adminBtn.hidden = false;
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
