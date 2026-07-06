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
  addDoc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const EMOJIS = ["😀", "😂", "😍", "👍", "❤️", "🔥", "🎉", "👀", "🙌", "😢", "😡", "🤔", "😎", "🥳", "👋", "💯"];

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
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatError = document.getElementById("chat-error");
const chatSubmitBtn = chatForm.querySelector('button[type="submit"]');
const onlineList = document.getElementById("online-list");
const emojiToggle = document.getElementById("emoji-toggle");
const emojiPicker = document.getElementById("emoji-picker");

let currentUid = null;
let currentProfile = null;
let isCurrentAdmin = false;
let usersWatchStarted = false;

EMOJIS.forEach((emoji) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = emoji;
  btn.addEventListener("click", () => {
    chatInput.value += emoji;
    emojiPicker.hidden = true;
    chatInput.focus();
  });
  emojiPicker.appendChild(btn);
});

emojiToggle.addEventListener("click", () => {
  emojiPicker.hidden = !emojiPicker.hidden;
});

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

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUid = user.uid;

  onSnapshot(doc(db, "users", user.uid), async (snap) => {
    if (!snap.exists()) {
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    const profile = snap.data();
    const now = new Date();

    if (profile.banned || (profile.bannedUntil && profile.bannedUntil.toDate() > now)) {
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    currentProfile = profile;
    isCurrentAdmin = !!profile.canManageUsers;
    welcomeName.textContent = profile.username;
    adminBtn.hidden = !isCurrentAdmin;
    updateChatFormState();

    if (isCurrentAdmin && !usersWatchStarted) {
      usersWatchStarted = true;
      watchUsers();
    }
  });

  startPresenceHeartbeat(user.uid);
  watchOnlineUsers();
  watchMessages();
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

function startPresenceHeartbeat(uid) {
  const ping = () => updateDoc(doc(db, "users", uid), { lastSeen: serverTimestamp() });
  ping();
  setInterval(ping, 20000);
}

function updateChatFormState() {
  const now = new Date();
  const banned =
    currentProfile.chatBanned || (currentProfile.chatBannedUntil && currentProfile.chatBannedUntil.toDate() > now);
  chatInput.disabled = banned;
  chatSubmitBtn.disabled = banned;
  chatError.textContent = banned ? "Du bist aktuell für den Chat gesperrt." : "";
}

function watchOnlineUsers() {
  onSnapshot(collection(db, "users"), (snapshot) => {
    onlineList.innerHTML = "";
    const now = Date.now();

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const lastSeenMs = data.lastSeen ? data.lastSeen.toDate().getTime() : 0;
      if (now - lastSeenMs > 60000) return;

      const li = document.createElement("li");

      const dot = document.createElement("span");
      dot.className = "online-dot";
      li.appendChild(dot);

      li.appendChild(document.createTextNode(" " + data.username));

      if (data.role === "admin") {
        const badge = document.createElement("span");
        badge.className = "admin-tag";
        badge.textContent = "ADMIN";
        li.appendChild(badge);
      }

      onlineList.appendChild(li);
    });
  });
}

function watchMessages() {
  const q = query(collection(db, "messages"), orderBy("createdAt", "asc"), limit(100));
  onSnapshot(q, (snapshot) => {
    chatMessages.innerHTML = "";
    snapshot.forEach((docSnap) => {
      chatMessages.appendChild(renderMessage(docSnap.id, docSnap.data()));
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

function renderMessage(id, data) {
  const div = document.createElement("div");
  div.className = "chat-message" + (data.role === "admin" ? " chat-message-admin" : "");

  const header = document.createElement("div");
  header.className = "chat-message-header";

  const usernameSpan = document.createElement("span");
  usernameSpan.className = "chat-username";
  usernameSpan.textContent = data.username;
  header.appendChild(usernameSpan);

  if (data.role === "admin") {
    const badge = document.createElement("span");
    badge.className = "admin-tag";
    badge.textContent = "ADMIN";
    header.appendChild(badge);
  }

  const timeSpan = document.createElement("span");
  timeSpan.className = "chat-time";
  timeSpan.textContent = data.createdAt
    ? data.createdAt.toDate().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : "";
  header.appendChild(timeSpan);

  div.appendChild(header);

  const textP = document.createElement("p");
  textP.className = "chat-text";
  textP.textContent = data.text;
  div.appendChild(textP);

  if (isCurrentAdmin && data.uid !== currentUid) {
    div.classList.add("chat-message-actionable");
    div.addEventListener("click", () => {
      div.classList.toggle("actions-visible");
    });

    const actions = document.createElement("div");
    actions.className = "chat-msg-actions";

    const banBtn = document.createElement("button");
    banBtn.type = "button";
    banBtn.textContent = "Chat-Bann";
    banBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleChatBan(data.uid, id);
    });

    const timeoutBtn = document.createElement("button");
    timeoutBtn.type = "button";
    timeoutBtn.textContent = "Chat-Timeout";
    timeoutBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      chatTimeout(data.uid, id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Nachricht löschen";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteMessage(id);
    });

    actions.appendChild(banBtn);
    actions.appendChild(timeoutBtn);
    actions.appendChild(deleteBtn);
    div.appendChild(actions);
  }

  return div;
}

async function toggleChatBan(uid, messageId) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return;
  const newBanned = !snap.data().chatBanned;
  await updateDoc(doc(db, "users", uid), { chatBanned: newBanned });
  if (newBanned) {
    await deleteMessage(messageId);
  }
}

async function chatTimeout(uid, messageId) {
  const minutes = prompt("Chat-Timeout in Minuten:", "5");
  if (!minutes || isNaN(minutes)) return;
  const until = new Date(Date.now() + Number(minutes) * 60000);
  await updateDoc(doc(db, "users", uid), { chatBannedUntil: Timestamp.fromDate(until) });
  await deleteMessage(messageId);
}

async function deleteMessage(messageId) {
  await deleteDoc(doc(db, "messages", messageId));
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  chatError.textContent = "";

  const text = chatInput.value.trim();
  if (!text) return;

  try {
    await addDoc(collection(db, "messages"), {
      uid: currentUid,
      username: currentProfile.username,
      role: currentProfile.role,
      text,
      createdAt: serverTimestamp(),
    });
    chatInput.value = "";
  } catch (err) {
    chatError.textContent = "Nachricht konnte nicht gesendet werden.";
  }
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
      chatBanned: false,
      chatBannedUntil: null,
      lastSeen: null,
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
