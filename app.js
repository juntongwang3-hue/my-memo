"use strict";

const STORAGE_KEY = "specialMemo.v2";
const CURRENT_MEMO_ID_KEY = "specialMemo.currentMemoId";

const state = {
  memos: [],
  currentMemoId: null,
  lockModalOpen: false,
};

const els = {
  newMemoBtn: document.getElementById("newMemoBtn"),
  searchInput: document.getElementById("searchInput"),
  memoList: document.getElementById("memoList"),
  emptyState: document.getElementById("emptyState"),
  lockedState: document.getElementById("lockedState"),
  editorState: document.getElementById("editorState"),
  unlockPasswordInput: document.getElementById("unlockPasswordInput"),
  unlockPasswordBtn: document.getElementById("unlockPasswordBtn"),
  unlockBiometricBtn: document.getElementById("unlockBiometricBtn"),
  unlockMessage: document.getElementById("unlockMessage"),
  lockMemoBtn: document.getElementById("lockMemoBtn"),
  relockMemoBtn: document.getElementById("relockMemoBtn"),
  removeLockBtn: document.getElementById("removeLockBtn"),
  deleteMemoBtn: document.getElementById("deleteMemoBtn"),
  titleInput: document.getElementById("titleInput"),
  contentInput: document.getElementById("contentInput"),
  editorMessage: document.getElementById("editorMessage"),
  lockModal: document.getElementById("lockModal"),
  lockPasswordInput: document.getElementById("lockPasswordInput"),
  confirmLockPasswordInput: document.getElementById("confirmLockPasswordInput"),
  enableBiometricInput: document.getElementById("enableBiometricInput"),
  lockModalMessage: document.getElementById("lockModalMessage"),
  cancelLockBtn: document.getElementById("cancelLockBtn"),
  confirmLockBtn: document.getElementById("confirmLockBtn"),
};

function generateId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function defaultMemo() {
  return {
    id: generateId(),
    title: "Untitled",
    content: "",
    updatedAt: Date.now(),
    lock: {
      enabled: false,
      passwordHash: null,
      biometricEnabled: false,
      credentialId: null,
    },
    unlocked: true,
  };
}

function getCurrentMemo() {
  return state.memos.find((memo) => memo.id === state.currentMemoId) ?? null;
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function resetMessages() {
  setMessage(els.unlockMessage, "");
  setMessage(els.editorMessage, "");
  setMessage(els.lockModalMessage, "");
}

async function sha256Hex(text) {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
}

function randomBuffer(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64(value) {
  const binary = atob(value);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }
  return array;
}

async function isPlatformBiometricAvailable() {
  if (
    !window.PublicKeyCredential ||
    !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
  ) {
    return false;
  }

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (_error) {
    return false;
  }
}

async function createBiometricCredential(memo) {
  const challenge = randomBuffer(32);
  const userId = randomBuffer(16);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Special Memo" },
      user: {
        id: userId,
        name: `memo-${memo.id}@local`,
        displayName: memo.title || "Untitled memo",
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
      },
      timeout: 60_000,
      attestation: "none",
    },
  });

  if (!credential) {
    throw new Error("Biometric enrollment cancelled.");
  }

  return toBase64(credential.rawId);
}

async function verifyBiometricCredential(credentialId) {
  const challenge = randomBuffer(32);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: "public-key", id: fromBase64(credentialId) }],
      userVerification: "required",
      timeout: 60_000,
    },
  });
  return Boolean(assertion);
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const memo = defaultMemo();
    state.memos = [memo];
    state.currentMemoId = memo.id;
    saveState();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Bad state payload");
    }

    state.memos = parsed.map((memo) => {
      const next = {
        ...defaultMemo(),
        ...memo,
        lock: {
          ...defaultMemo().lock,
          ...(memo.lock ?? {}),
        },
      };
      next.unlocked = next.lock.enabled ? false : true;
      return next;
    });

    const savedCurrentId = localStorage.getItem(CURRENT_MEMO_ID_KEY);
    state.currentMemoId = state.memos.some((memo) => memo.id === savedCurrentId)
      ? savedCurrentId
      : state.memos[0].id;
  } catch (_error) {
    const memo = defaultMemo();
    state.memos = [memo];
    state.currentMemoId = memo.id;
    saveState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.memos));
  if (state.currentMemoId) {
    localStorage.setItem(CURRENT_MEMO_ID_KEY, state.currentMemoId);
  }
}

function renderMemoList() {
  const query = els.searchInput.value.trim().toLowerCase();
  const items = state.memos
    .filter((memo) => {
      if (!query) {
        return true;
      }
      return (
        memo.title.toLowerCase().includes(query) ||
        memo.content.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (items.length === 0) {
    els.memoList.innerHTML = "<li>No matching memos.</li>";
    return;
  }

  els.memoList.innerHTML = items
    .map((memo) => {
      const activeClass = memo.id === state.currentMemoId ? "active" : "";
      const title = memo.title || "Untitled";
      const preview = memo.lock.enabled
        ? "Locked memo"
        : memo.content.trim().slice(0, 70) || "No content yet";
      const lockPrefix = memo.lock.enabled ? "🔒 " : "";
      return `
        <li>
          <button class="memo-item-btn ${activeClass}" data-id="${memo.id}">
            <div class="memo-title">${lockPrefix}${title}</div>
            <div class="memo-preview">${preview}</div>
          </button>
        </li>
      `;
    })
    .join("");
}

function renderBody() {
  const memo = getCurrentMemo();

  if (!memo) {
    els.emptyState.classList.remove("hidden");
    els.lockedState.classList.add("hidden");
    els.editorState.classList.add("hidden");
    return;
  }

  const isLocked = memo.lock.enabled;
  const canRead = !isLocked || memo.unlocked;
  els.emptyState.classList.add("hidden");

  if (!canRead) {
    els.lockedState.classList.remove("hidden");
    els.editorState.classList.add("hidden");
    els.unlockBiometricBtn.classList.toggle(
      "hidden",
      !memo.lock.biometricEnabled || !memo.lock.credentialId
    );
    els.unlockPasswordInput.value = "";
    return;
  }

  els.lockedState.classList.add("hidden");
  els.editorState.classList.remove("hidden");

  els.titleInput.value = memo.title;
  els.contentInput.value = memo.content;
  els.removeLockBtn.classList.toggle("hidden", !isLocked);
  els.relockMemoBtn.classList.toggle("hidden", !isLocked || !memo.unlocked);
  els.lockMemoBtn.classList.toggle("hidden", isLocked);
}

function renderAll() {
  renderMemoList();
  renderBody();
}

function selectMemo(memoId) {
  if (!state.memos.some((memo) => memo.id === memoId)) {
    return;
  }
  state.currentMemoId = memoId;
  saveState();
  resetMessages();
  renderAll();
}

function createMemo() {
  const memo = defaultMemo();
  state.memos.unshift(memo);
  state.currentMemoId = memo.id;
  saveState();
  renderAll();
}

function deleteCurrentMemo() {
  if (state.memos.length <= 1) {
    setMessage(els.editorMessage, "At least one memo must remain.", true);
    return;
  }
  const memo = getCurrentMemo();
  if (!memo) {
    return;
  }
  if (!confirm("Delete this memo?")) {
    return;
  }

  state.memos = state.memos.filter((item) => item.id !== memo.id);
  state.currentMemoId = state.memos[0]?.id ?? null;
  saveState();
  renderAll();
}

function updateCurrentMemoFromEditor() {
  const memo = getCurrentMemo();
  if (!memo) {
    return;
  }
  if (memo.lock.enabled && !memo.unlocked) {
    return;
  }
  memo.title = els.titleInput.value.trim() || "Untitled";
  memo.content = els.contentInput.value;
  memo.updatedAt = Date.now();
  saveState();
  renderMemoList();
}

function openLockModal() {
  state.lockModalOpen = true;
  els.lockPasswordInput.value = "";
  els.confirmLockPasswordInput.value = "";
  els.enableBiometricInput.checked = false;
  setMessage(els.lockModalMessage, "");
  els.lockModal.classList.remove("hidden");
  els.lockPasswordInput.focus();
}

function closeLockModal() {
  state.lockModalOpen = false;
  els.lockModal.classList.add("hidden");
}

async function lockCurrentMemo() {
  const memo = getCurrentMemo();
  if (!memo || memo.lock.enabled) {
    return;
  }
  openLockModal();
}

function relockCurrentMemo() {
  const memo = getCurrentMemo();
  if (!memo || !memo.lock.enabled) {
    return;
  }
  memo.unlocked = false;
  saveState();
  renderAll();
}

async function removeLock() {
  const memo = getCurrentMemo();
  if (!memo || !memo.lock.enabled) {
    return;
  }
  if (!memo.unlocked) {
    setMessage(els.unlockMessage, "Unlock first before removing lock.", true);
    return;
  }

  memo.lock = {
    enabled: false,
    passwordHash: null,
    biometricEnabled: false,
    credentialId: null,
  };
  memo.unlocked = true;
  memo.updatedAt = Date.now();
  saveState();
  setMessage(els.editorMessage, "Lock removed.");
  renderAll();
}

async function confirmSetLock() {
  const memo = getCurrentMemo();
  if (!memo || memo.lock.enabled) {
    closeLockModal();
    return;
  }

  const password = els.lockPasswordInput.value;
  const confirmPassword = els.confirmLockPasswordInput.value;
  const useBiometric = els.enableBiometricInput.checked;

  if (!password || !confirmPassword) {
    setMessage(els.lockModalMessage, "Password and confirmation are required.", true);
    return;
  }
  if (password !== confirmPassword) {
    setMessage(els.lockModalMessage, "Passwords do not match.", true);
    return;
  }
  if (password.length < 4) {
    setMessage(els.lockModalMessage, "Password must be at least 4 characters.", true);
    return;
  }

  try {
    let credentialId = null;
    if (useBiometric) {
      const supported = await isPlatformBiometricAvailable();
      if (!supported) {
        setMessage(
          els.lockModalMessage,
          "Biometric unlock is unavailable on this browser/device.",
          true
        );
        return;
      }
      credentialId = await createBiometricCredential(memo);
    }

    memo.lock.enabled = true;
    memo.lock.passwordHash = await sha256Hex(password);
    memo.lock.biometricEnabled = Boolean(useBiometric && credentialId);
    memo.lock.credentialId = credentialId;
    memo.unlocked = true;
    memo.updatedAt = Date.now();
    saveState();
    closeLockModal();
    setMessage(els.editorMessage, "Memo locked. Use Relock to hide content now.");
    renderAll();
  } catch (error) {
    setMessage(
      els.lockModalMessage,
      "Could not set biometric lock. Try again or disable biometrics.",
      true
    );
    console.error(error);
  }
}

async function unlockWithPassword() {
  const memo = getCurrentMemo();
  if (!memo || !memo.lock.enabled || memo.unlocked) {
    return;
  }

  const password = els.unlockPasswordInput.value;
  if (!password) {
    setMessage(els.unlockMessage, "Enter the password first.", true);
    return;
  }

  const passwordHash = await sha256Hex(password);
  if (passwordHash !== memo.lock.passwordHash) {
    setMessage(els.unlockMessage, "Wrong password.", true);
    return;
  }

  memo.unlocked = true;
  saveState();
  setMessage(els.unlockMessage, "");
  renderAll();
}

async function unlockWithBiometric() {
  const memo = getCurrentMemo();
  if (!memo || !memo.lock.enabled || memo.unlocked) {
    return;
  }

  if (!memo.lock.biometricEnabled || !memo.lock.credentialId) {
    setMessage(els.unlockMessage, "Biometric unlock is not set for this memo.", true);
    return;
  }

  const supported = await isPlatformBiometricAvailable();
  if (!supported) {
    setMessage(els.unlockMessage, "Biometric unlock is unavailable on this device.", true);
    return;
  }

  try {
    const verified = await verifyBiometricCredential(memo.lock.credentialId);
    if (!verified) {
      throw new Error("Verification failed");
    }
    memo.unlocked = true;
    saveState();
    setMessage(els.unlockMessage, "");
    renderAll();
  } catch (error) {
    setMessage(els.unlockMessage, "Biometric verification failed.", true);
    console.error(error);
  }
}

function lockAllProtectedMemos() {
  for (const memo of state.memos) {
    if (memo.lock.enabled) {
      memo.unlocked = false;
    }
  }
  saveState();
}

function bindEvents() {
  els.newMemoBtn.addEventListener("click", createMemo);
  els.searchInput.addEventListener("input", renderMemoList);
  els.memoList.addEventListener("click", (event) => {
    const button = event.target.closest(".memo-item-btn");
    if (!button || !button.dataset.id) {
      return;
    }
    selectMemo(button.dataset.id);
  });

  els.titleInput.addEventListener("input", updateCurrentMemoFromEditor);
  els.contentInput.addEventListener("input", updateCurrentMemoFromEditor);
  els.deleteMemoBtn.addEventListener("click", deleteCurrentMemo);
  els.lockMemoBtn.addEventListener("click", lockCurrentMemo);
  els.relockMemoBtn.addEventListener("click", relockCurrentMemo);
  els.removeLockBtn.addEventListener("click", removeLock);

  els.unlockPasswordBtn.addEventListener("click", unlockWithPassword);
  els.unlockBiometricBtn.addEventListener("click", unlockWithBiometric);
  els.unlockPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      unlockWithPassword();
    }
  });

  els.cancelLockBtn.addEventListener("click", closeLockModal);
  els.confirmLockBtn.addEventListener("click", confirmSetLock);
  els.lockModal.addEventListener("click", (event) => {
    if (event.target === els.lockModal) {
      closeLockModal();
    }
  });

  window.addEventListener("beforeunload", lockAllProtectedMemos);
}

function init() {
  loadState();
  bindEvents();
  renderAll();
}

init();
