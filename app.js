const appIdInput = document.getElementById("appId");
const channelInput = document.getElementById("channel");
const tokenInput = document.getElementById("token");
const uidInput = document.getElementById("uid");
const joinBtn = document.getElementById("joinBtn");
const leaveBtn = document.getElementById("leaveBtn");
const statusEl = document.getElementById("status");
const videosGrid = document.getElementById("videos-grid");
const localCard = document.getElementById("local-card");
const localPlayerEl = document.getElementById("local-player");
const localFitBtn = document.getElementById("local-fit-btn");
const localPinBtn = document.getElementById("local-pin-btn");
const localZoomInBtn = document.getElementById("local-zoom-in-btn");
const localZoomOutBtn = document.getElementById("local-zoom-out-btn");

// Role & Mic Mute selectors
const roleInput = document.getElementById("role");
const feedTypeContainer = document.getElementById("feed-type-container");
const feedTypeInput = document.getElementById("feedType");
const muteBtn = document.getElementById("muteBtn");
const localCameraBtn = document.getElementById("local-camera-btn");
const localMicBtn = document.getElementById("local-mic-btn");
const backBtn = document.getElementById("backBtn");

// Floating self-view selectors
const floatingSelfView = document.getElementById("floating-self-view");
const selfViewCloseBtn = document.getElementById("self-view-close-btn");
const selfViewCamBtn = document.getElementById("self-view-cam-btn");
const selfViewMicBtn = document.getElementById("self-view-mic-btn");
const selfViewMinimizeBtn = document.getElementById("self-view-minimize-btn");

let client;
let localTracks = {
  audioTrack: null,
  videoTrack: null,
};

let popoutWindow = null;
let doctorPopoutWindow = null;
let patientPopoutWindow = null;
const viewerPopoutWindows = new Map();

// Store zoom and translation states for each video card container
const zoomStates = new Map();

// Initialize local card state
localCard.classList.add("fit-contain");

// Dynamically toggle visibility of the feed-type selector based on Role and automatically lock pre-defined UIDs
roleInput.addEventListener("change", () => {
  const selectedRole = roleInput.value;
  if (selectedRole === "doctor") {
    uidInput.value = 3001;
  } else if (selectedRole === "patient") {
    uidInput.value = 4001;
  } else if (selectedRole === "viewer") {
    // Generate a unique random UID for each viewer tab (e.g. 6000 + random)
    uidInput.value = 6000 + Math.floor(Math.random() * 9000);
  }
  feedTypeContainer.style.display = selectedRole === "patient" ? "" : "none";
});

// Join Order Tracking & Sorting
const joinOrder = [];

function updateCardOrders() {
  const localUidVal = uidInput.value.trim() ? Number(uidInput.value) : (roleInput.value === "patient" ? 4001 : 3001);

  // Separate viewers from other feeds
  const coreFeeds = [5001, 4001, 3001];

  // Find all active viewers in joinOrder
  const viewersInCall = joinOrder.filter(uid => !coreFeeds.includes(uid));
  // Sort viewers by their assigned viewer numbers
  viewersInCall.sort((a, b) => getViewerNumber(a) - getViewerNumber(b));

  const displayList = [];

  // 1. Ultrasound Feed
  if (joinOrder.includes(5001)) {
    displayList.push(5001);
  }
  // 2. Viewer 1
  if (viewersInCall.length > 0) {
    displayList.push(viewersInCall[0]);
  }
  // 3. Patient Camera
  if (joinOrder.includes(4001)) {
    displayList.push(4001);
  }
  // 4. Doctor Camera
  if (joinOrder.includes(3001)) {
    displayList.push(3001);
  }
  // 5. Rest of the viewers (Viewer 2, Viewer 3, ...)
  for (let i = 1; i < viewersInCall.length; i++) {
    displayList.push(viewersInCall[i]);
  }

  // Update card elements' style order and titles
  const cards = document.querySelectorAll(".video-card");
  cards.forEach(card => {
    let uid;
    if (card.id === "local-card") {
      uid = localUidVal;
    } else {
      uid = Number(card.id.replace("remote-card-", ""));
    }

    const idx = displayList.indexOf(uid);
    if (idx !== -1) {
      card.style.order = idx + 1;
    } else {
      card.style.order = 999;
    }

    // Dynamic Title Management
    const h2 = card.querySelector(".video-header h2");
    if (h2) {
      if (uid === 5001) {
        h2.innerHTML = "🩺 Remote Ultrasound Feed";
      } else if (uid === 3001) {
        const isLocal = (card.id === "local-card");
        const hasVideo = isLocal ? !!localTracks.videoTrack : !!client?.remoteUsers.find(u => u.uid === 3001)?.videoTrack;
        h2.innerHTML = "📹 Doctor Camera" + (hasVideo ? "" : " (No Video)");
      } else if (uid === 4001) {
        const isLocal = (card.id === "local-card");
        const hasVideo = isLocal ? !!localTracks.videoTrack : !!client?.remoteUsers.find(u => u.uid === 4001)?.videoTrack;
        h2.innerHTML = "🩺 Patient Camera" + (hasVideo ? "" : " (No Video)");
      } else {
        const viewerNum = getViewerNumber(uid);
        const isLocal = (card.id === "local-card");
        const hasVideo = isLocal ? !!localTracks.videoTrack : !!client?.remoteUsers.find(u => u.uid === uid)?.videoTrack;
        h2.innerHTML = `👤 Viewer ${viewerNum} Camera` + (hasVideo ? "" : " (No Video)");
      }
    }

    // Show/hide popout button on local card
    if (card.id === "local-card") {
      const localPopoutBtn = document.getElementById("local-popout-btn");
      if (localPopoutBtn) {
        localPopoutBtn.style.display = "";
      }
    }
  });
}

// ==========================================================================
// VIEWER DYNAMIC TRACKING & NUMBERING LOGIC
// ==========================================================================
const activeViewers = new Set();

function getViewerNumber(uid) {
  const viewers = Array.from(activeViewers);
  viewers.sort((a, b) => a - b);
  const idx = viewers.indexOf(uid);
  return idx !== -1 ? idx + 1 : 1;
}

// Mirroring Local Camera Feed to Floating Self-View Canvas
let mirrorActive = false;

function startSelfViewMirror() {
  const canvas = document.getElementById("self-view-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function drawFrame() {
    if (!mirrorActive) return;

    const localVideo = localPlayerEl.querySelector("video");
    const isCamActive = localCameraBtn && localCameraBtn.classList.contains("active");
    if (isCamActive && localVideo && localVideo.readyState >= 2) {
      if (canvas.width !== localVideo.videoWidth || canvas.height !== localVideo.videoHeight) {
        canvas.width = localVideo.videoWidth;
        canvas.height = localVideo.videoHeight;
      }
      ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0c0d17";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#9ca3af";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Camera Preview Muted", canvas.width / 2, canvas.height / 2);
    }

    // Periodically sync self view overlay icon states
    syncSelfViewControls();

    requestAnimationFrame(drawFrame);
  }

  mirrorActive = true;
  requestAnimationFrame(drawFrame);
}

function stopSelfViewMirror() {
  mirrorActive = false;
}

function syncSelfViewControls() {
  if (!selfViewCamBtn || !selfViewMicBtn) return;

  if (localCameraBtn.classList.contains("active")) {
    selfViewCamBtn.classList.remove("inactive");
    selfViewCamBtn.classList.add("active");
    selfViewCamBtn.title = "Turn Camera OFF";
  } else {
    selfViewCamBtn.classList.add("inactive");
    selfViewCamBtn.classList.remove("active");
    selfViewCamBtn.title = "Turn Camera ON";
  }

  if (localMicBtn.classList.contains("active")) {
    selfViewMicBtn.classList.remove("inactive");
    selfViewMicBtn.classList.add("active");
    selfViewMicBtn.title = "Mute Microphone";
  } else {
    selfViewMicBtn.classList.add("inactive");
    selfViewMicBtn.classList.remove("active");
    selfViewMicBtn.title = "Unmute Microphone";
  }
}

function resetFloatingSelfViewPosition() {
  if (floatingSelfView) {
    floatingSelfView.style.left = "";
    floatingSelfView.style.top = "";
    floatingSelfView.style.bottom = "";
    floatingSelfView.style.transform = "";
    floatingSelfView.classList.remove("minimized");

    // Also reset minimize button icon and title
    const minBtn = document.getElementById("self-view-minimize-btn");
    if (minBtn) {
      minBtn.title = "Minimize Self View";
      minBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      `;
    }
  }
}


function setStatus(message) {
  const statusText = statusEl.querySelector(".status-text");
  if (statusText) {
    statusText.textContent = message;
  } else {
    statusEl.textContent = message;
  }

  statusEl.className = "status-pill";
  const msgLower = message.toLowerCase();
  if (msgLower.includes("connected to")) {
    statusEl.classList.add("connected");
  } else if (msgLower.includes("connecting") || msgLower.includes("joining")) {
    statusEl.classList.add("connecting");
  } else if (msgLower.includes("failed") || msgLower.includes("error") || msgLower.includes("enter")) {
    statusEl.classList.add("error");
  } else {
    statusEl.classList.add("disconnected");
  }
}

// Retrieves the inner HTML5 <video> tag injected by Agora SDK
function getVideoElement(playerEl) {
  return playerEl.querySelector("video");
}

// Applies scale and translation transforms dynamically to the HTML5 video element
function applyZoomTransform(card, playerEl) {
  const video = getVideoElement(playerEl);
  if (!video) return;

  let state = zoomStates.get(card.id);
  if (!state) {
    state = { scale: 1.0, translateX: 0, translateY: 0, isDragging: false };
    zoomStates.set(card.id, state);
  }

  video.style.transformOrigin = "center center";
  video.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;

  // Manage floating Zoom Indicator overlay
  let indicator = playerEl.querySelector(".zoom-indicator");
  if (state.scale > 1.0) {
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "zoom-indicator";
      playerEl.appendChild(indicator);
    }
    indicator.textContent = `${state.scale.toFixed(2)}x Zoom (Drag to Pan)`;
    playerEl.style.cursor = "grab";
  } else {
    if (indicator) {
      indicator.remove();
    }
    playerEl.style.cursor = "default";
  }
}

// Adjusts the zoom scale and constrains translations within container bounds
function adjustZoom(card, playerEl, delta) {
  let state = zoomStates.get(card.id);
  if (!state) {
    state = { scale: 1.0, translateX: 0, translateY: 0, isDragging: false };
    zoomStates.set(card.id, state);
  }

  state.scale = Math.max(1.0, Math.min(5.0, state.scale + delta));

  if (state.scale === 1.0) {
    state.translateX = 0;
    state.translateY = 0;
  } else {
    // If zoom level changes, ensure current panning doesn't reveal empty black gutters
    const rect = playerEl.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const maxTranslateX = ((state.scale - 1) * W) / 2;
    const maxTranslateY = ((state.scale - 1) * H) / 2;

    state.translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, state.translateX));
    state.translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, state.translateY));
  }

  applyZoomTransform(card, playerEl);
}

// Registers Pointer events for seamless mouse/touch-drag panning when zoomed
function setupZoomAndPan(card, playerEl) {
  const cardId = card.id;

  if (!zoomStates.has(cardId)) {
    zoomStates.set(cardId, {
      scale: 1.0,
      translateX: 0,
      translateY: 0,
      isDragging: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0
    });
  }

  playerEl.addEventListener("pointerdown", (e) => {
    const state = zoomStates.get(cardId);
    if (!state || state.scale <= 1.0) return;

    // Only register drag if left-clicked (mouse)
    if (e.pointerType === "mouse" && e.button !== 0) return;

    state.isDragging = true;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.currentX = state.translateX;
    state.currentY = state.translateY;

    playerEl.classList.add("dragging");
    playerEl.style.cursor = "grabbing";
    playerEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  playerEl.addEventListener("pointermove", (e) => {
    const state = zoomStates.get(cardId);
    if (!state || !state.isDragging) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    const rect = playerEl.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const maxTranslateX = ((state.scale - 1) * W) / 2;
    const maxTranslateY = ((state.scale - 1) * H) / 2;

    state.translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, state.currentX + dx));
    state.translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, state.currentY + dy));

    applyZoomTransform(card, playerEl);
  });

  const handleDragEnd = (e) => {
    const state = zoomStates.get(cardId);
    if (!state || !state.isDragging) return;

    state.isDragging = false;
    playerEl.classList.remove("dragging");
    playerEl.style.cursor = "grab";
    playerEl.releasePointerCapture(e.pointerId);
  };

  playerEl.addEventListener("pointerup", handleDragEnd);
  playerEl.addEventListener("pointercancel", handleDragEnd);
}

// Toggles Fit mode (Fit vs Fill)
function toggleFit(card, button) {
  if (card.classList.contains("fit-contain")) {
    card.classList.remove("fit-contain");
    card.classList.add("fit-cover");
    button.textContent = "Fill";
    button.classList.add("active");
  } else {
    card.classList.remove("fit-cover");
    card.classList.add("fit-contain");
    button.textContent = "Fit";
    button.classList.remove("active");
  }
}

// Toggles Focus mode (Maximize/Pin)
function togglePin(card) {
  const isPinned = card.classList.contains("pinned");

  // Unpin all other cards first to maintain single primary focus
  const allCards = document.querySelectorAll(".video-card");
  allCards.forEach(c => {
    c.classList.remove("pinned");
    const pinBtn = c.querySelector(".pin-btn");
    if (pinBtn) {
      pinBtn.textContent = "Focus";
      pinBtn.classList.remove("active");
    }
  });

  if (!isPinned) {
    card.classList.add("pinned");
    const pinBtn = card.querySelector(".pin-btn");
    if (pinBtn) {
      pinBtn.textContent = "Unfocus";
      pinBtn.classList.add("active");
    }
    // Scroll the pinned element into view smoothly
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Recalculate grid rendering order based on the new focused state
  updateCardOrders();
}

// Inspects the video track and sets the CSS --video-aspect ratio dynamically
function applyTrackAspectRatio(card, videoTrack) {
  try {
    if (!videoTrack) return;
    const mediaTrack = videoTrack.getMediaStreamTrack();
    if (mediaTrack) {
      const settings = mediaTrack.getSettings();
      if (settings && settings.width && settings.height) {
        const ratio = settings.width / settings.height;
        card.style.setProperty("--video-aspect", ratio);
        card.classList.add("has-aspect");
        console.log(`Applied aspect ratio of ${ratio} (${settings.width}x${settings.height}) to card ${card.id}`);
      }
    }
  } catch (err) {
    console.warn("Failed to retrieve or apply track aspect ratio settings:", err);
  }
}

// Setup local card listeners
localFitBtn.addEventListener("click", () => {
  toggleFit(localCard, localFitBtn);
});

localPinBtn.addEventListener("click", () => {
  togglePin(localCard);
});

const localPopoutBtn = document.getElementById("local-popout-btn");
if (localPopoutBtn) {
  localPopoutBtn.addEventListener("click", () => {
    const localUidVal = uidInput.value.trim() ? Number(uidInput.value) : (roleInput.value === "patient" ? 4001 : 3001);
    if (localUidVal === 3001) {
      openDoctorPopoutWindow();
    } else if (localUidVal === 5001) {
      openPopoutWindow();
    } else {
      openGenericPopoutWindow(localUidVal);
    }
  });
}

localZoomInBtn.addEventListener("click", () => {
  adjustZoom(localCard, localPlayerEl, 0.25);
});

localZoomOutBtn.addEventListener("click", () => {
  adjustZoom(localCard, localPlayerEl, -0.25);
});

setupZoomAndPan(localCard, localPlayerEl);

// Local Camera Button handler
localCameraBtn.addEventListener("click", async () => {
  if (!localTracks.videoTrack) return;
  const isActive = localCameraBtn.classList.contains("active");
  await localTracks.videoTrack.setEnabled(!isActive);

  if (isActive) {
    localCameraBtn.classList.remove("active");
    localCameraBtn.classList.add("inactive");
    localCameraBtn.title = "Turn Camera ON";
  } else {
    localCameraBtn.classList.add("active");
    localCameraBtn.classList.remove("inactive");
    localCameraBtn.title = "Turn Camera OFF";
  }
});

// Central helper to synchronize local mic mute/unmute status with track, buttons, self-view, and localStorage/logs
async function setLocalMicMuteState(muted) {
  if (!localTracks.audioTrack) return;
  await localTracks.audioTrack.setEnabled(!muted);

  if (muted) {
    localMicBtn.classList.remove("active");
    localMicBtn.classList.add("inactive");
    localMicBtn.title = "Unmute Microphone";
    muteBtn.textContent = "Unmute Mic";
    muteBtn.classList.add("muted");
  } else {
    localMicBtn.classList.add("active");
    localMicBtn.classList.remove("inactive");
    localMicBtn.title = "Mute Microphone";
    muteBtn.textContent = "Mute Mic";
    muteBtn.classList.remove("muted");
  }

  // Sync floating self-view overlay controls
  syncSelfViewControls();

  if (roleInput.value === "patient") {
    localStorage.setItem("patient_mic_muted", muted ? "true" : "false");
    if (muted) {
      console.log("Patient microphone muted");
    } else {
      console.log("Patient microphone unmuted");
    }
  }
}

// Local Mic Button handler
localMicBtn.addEventListener("click", async () => {
  if (!localTracks.audioTrack) return;
  const isCurrentlyMuted = !localMicBtn.classList.contains("active");
  await setLocalMicMuteState(!isCurrentlyMuted);
});

// Microphone Mute Button handler (kept for compatibility)
muteBtn.addEventListener("click", async () => {
  if (!localTracks.audioTrack) return;
  const isCurrentlyMuted = muteBtn.classList.contains("muted");
  await setLocalMicMuteState(!isCurrentlyMuted);
});

// Dynamic creation of a remote participant's card with controls
function createRemotePlayer(uid, videoTrack) {
  const cardId = `remote-card-${uid}`;
  let card = document.getElementById(cardId);

  if (!card) {
    card = document.createElement("div");
    card.id = cardId;
    card.className = "video-card fit-contain"; // Default to fit-contain for ultrasound safety (no crop)

    const header = document.createElement("div");
    header.className = "video-header";

    const h2 = document.createElement("h2");

    // Label roles intuitively based on predefined UIDs
    if (uid === 5001) {
      h2.innerHTML = "🩺 Remote Ultrasound Feed";
    } else if (uid === 3001) {
      h2.innerHTML = "📹 Doctor Camera (No Video)";
    } else if (uid === 4001) {
      h2.innerHTML = "🩺 Patient Camera (No Video)";
    } else {
      const viewerNum = getViewerNumber(uid);
      h2.innerHTML = `👤 Viewer ${viewerNum} Camera (No Video)`;
    }

    header.appendChild(h2);

    const controls = document.createElement("div");
    controls.className = "video-controls";

    // Remote Camera Toggle Button
    const camBtn = document.createElement("button");
    if (videoTrack) {
      camBtn.className = "control-btn toggle-btn camera-btn active";
      camBtn.title = "Turn Camera OFF";
      camBtn.disabled = false;
    } else {
      camBtn.className = "control-btn toggle-btn camera-btn inactive";
      camBtn.title = "Turn Camera ON";
      camBtn.disabled = true;
    }
    camBtn.type = "button";
    camBtn.innerHTML = `
      <svg class="icon-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 7l-7 5 7 5V7z"></path>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
      </svg>
      <svg class="icon-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10l-2.58-1.84M23 7l-7 5 7 5V7z"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;
    camBtn.addEventListener("click", () => {
      const user = client?.remoteUsers.find(u => u.uid === uid);
      if (!user || !user.videoTrack) return;
      const isActive = camBtn.classList.contains("active");
      if (isActive) {
        user.videoTrack.stop();
        camBtn.classList.remove("active");
        camBtn.classList.add("inactive");
        camBtn.title = "Turn Camera ON";
      } else {
        user.videoTrack.play(player, { fit: card.classList.contains("fit-contain") ? "contain" : "cover" });
        camBtn.classList.add("active");
        camBtn.classList.remove("inactive");
        camBtn.title = "Turn Camera OFF";
      }
    });

    // Remote Mic Toggle Button (inactive/disabled by default, will activate if mic track is present)
    const micBtn = document.createElement("button");
    const hasAudio = !!(client?.remoteUsers.find(u => u.uid === uid)?.audioTrack);
    if (hasAudio) {
      micBtn.className = "control-btn toggle-btn mic-btn active";
      micBtn.title = "Mute Microphone";
      micBtn.disabled = false;
    } else {
      micBtn.className = "control-btn toggle-btn mic-btn inactive";
      micBtn.title = "Mute Microphone";
      micBtn.disabled = true;
    }
    micBtn.type = "button";
    micBtn.innerHTML = `
      <svg class="icon-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
      <svg class="icon-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
        <path d="M17 11a5 5 0 0 1-5 5m-3.87-1.17A7 7 0 0 1 5 10v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    `;
    micBtn.addEventListener("click", () => {
      const user = client?.remoteUsers.find(u => u.uid === uid);
      if (!user || !user.audioTrack) return;
      const isActive = micBtn.classList.contains("active");
      if (isActive) {
        user.audioTrack.setVolume(0);
        micBtn.classList.remove("active");
        micBtn.classList.add("inactive");
        micBtn.title = "Unmute Microphone";
      } else {
        user.audioTrack.setVolume(100);
        micBtn.classList.add("active");
        micBtn.classList.remove("inactive");
        micBtn.title = "Mute Microphone";
      }
    });

    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.className = "control-btn zoom-out-btn";
    zoomOutBtn.type = "button";
    zoomOutBtn.textContent = "-";
    zoomOutBtn.title = "Zoom Out";
    zoomOutBtn.addEventListener("click", () => {
      adjustZoom(card, player, -0.25);
    });

    const zoomInBtn = document.createElement("button");
    zoomInBtn.className = "control-btn zoom-in-btn";
    zoomInBtn.type = "button";
    zoomInBtn.textContent = "+";
    zoomInBtn.title = "Zoom In";
    zoomInBtn.addEventListener("click", () => {
      adjustZoom(card, player, 0.25);
    });

    const fitBtn = document.createElement("button");
    fitBtn.className = "control-btn fit-btn";
    fitBtn.type = "button";
    fitBtn.textContent = "Fit";
    fitBtn.title = "Toggle Fit/Fill Mode";
    fitBtn.addEventListener("click", () => {
      toggleFit(card, fitBtn);
    });

    const pinBtn = document.createElement("button");
    pinBtn.className = "control-btn pin-btn";
    pinBtn.type = "button";
    pinBtn.textContent = "Focus";
    pinBtn.title = "Focus/Pin Feed";
    pinBtn.addEventListener("click", () => {
      togglePin(card);
    });

    controls.appendChild(camBtn);
    controls.appendChild(micBtn);
    controls.appendChild(zoomOutBtn);
    controls.appendChild(zoomInBtn);
    controls.appendChild(fitBtn);
    controls.appendChild(pinBtn);

    if (uid === 5001) {
      const popoutBtn = document.createElement("button");
      popoutBtn.className = "control-btn toggle-btn popout-btn";
      popoutBtn.type = "button";
      popoutBtn.title = "Open in New Window";
      popoutBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      `;
      popoutBtn.addEventListener("click", openPopoutWindow);
      controls.appendChild(popoutBtn);
    } else if (uid === 3001) {
      const popoutBtn = document.createElement("button");
      popoutBtn.className = "control-btn toggle-btn popout-btn";
      popoutBtn.type = "button";
      popoutBtn.title = "Open in New Window";
      popoutBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      `;
      popoutBtn.addEventListener("click", openDoctorPopoutWindow);
      controls.appendChild(popoutBtn);
    } else {
      const popoutBtn = document.createElement("button");
      popoutBtn.className = "control-btn toggle-btn popout-btn";
      popoutBtn.type = "button";
      popoutBtn.title = "Open in New Window";
      popoutBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      `;
      popoutBtn.addEventListener("click", () => openGenericPopoutWindow(uid));
      controls.appendChild(popoutBtn);
    }

    header.appendChild(controls);
    card.appendChild(header);

    const player = document.createElement("div");
    player.id = `remote-player-${uid}`;
    player.className = "remote-player";

    // Default placeholder for View-Only mode when video is not publishing
    if (!videoTrack) {
      player.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; gap: 8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          No Camera Input (View-Only Mode)
        </div>
      `;
    }

    card.appendChild(player);

    videosGrid.appendChild(card);

    // Register Zoom & Pan dragging event handlers
    setupZoomAndPan(card, player);
  }

  return document.getElementById(`remote-player-${uid}`);
}

// Helper to acquire local tracks with robust fallbacks in case of missing or locked devices
async function acquireLocalTracks(role, feedType) {
  let audioTrack = null;
  let videoTrack = null;
  let hasMicPermission = true;

  if (role === "patient") {
    try {
      console.log("Patient: Requesting microphone permission via getUserMedia...");
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(track => track.stop());
    } catch (permissionErr) {
      hasMicPermission = false;
      console.warn("Microphone permission denied via getUserMedia:", permissionErr);
      alert("Microphone permission denied. Joining the call with camera only.");
    }
  }

  if (role === "patient" && feedType === "screen") {
    // Screen Share Source
    try {
      const screenTrack = await AgoraRTC.createScreenVideoTrack({
        encoderConfig: "1080p_1",
        optimizationMode: "detail"
      }, "auto");

      if (Array.isArray(screenTrack)) {
        videoTrack = screenTrack[0];
        if (screenTrack[1]) screenTrack[1].close();
      } else {
        videoTrack = screenTrack;
      }
    } catch (e) {
      console.warn("Screen share capture failed:", e);
      throw new Error("Failed to start screen share: " + (e.message || e));
    }

    if (hasMicPermission) {
      try {
        audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        if (audioTrack && role === "patient") {
          console.log("Patient microphone initialized");
        }
      } catch (e) {
        console.warn("Microphone access failed for screen share, continuing without audio:", e);
      }
    }
  } else {
    // Standard Camera + Mic Source with full fallback chain
    if (hasMicPermission) {
      try {
        // Step 1: Try capturing both
        const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
        audioTrack = tracks[0];
        videoTrack = tracks[1];
        if (audioTrack && role === "patient") {
          console.log("Patient microphone initialized");
        }
      } catch (err) {
        console.warn("Failed to capture both camera and microphone, trying fallbacks:", err);

        // Step 2: Try capturing video only
        try {
          videoTrack = await AgoraRTC.createCameraVideoTrack();
        } catch (videoErr) {
          console.warn("Camera capture failed:", videoErr);
        }

        // Step 3: Try capturing audio only
        try {
          audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          if (audioTrack && role === "patient") {
            console.log("Patient microphone initialized");
          }
        } catch (audioErr) {
          console.warn("Microphone capture failed:", audioErr);
        }
      }
    } else {
      // If we don't have mic permission, only capture video
      try {
        videoTrack = await AgoraRTC.createCameraVideoTrack();
      } catch (videoErr) {
        console.warn("Camera capture failed:", videoErr);
      }
    }
  }

  return { audioTrack, videoTrack };
}

async function joinCall() {
  const appId = appIdInput.value.trim();
  const channel = channelInput.value.trim();
  const tokenText = tokenInput.value.trim();
  const token = tokenText || null;
  const role = roleInput.value;
  const feedType = feedTypeInput.value;

  // Set default UID based on Role to facilitate identification (Patient = 1, Doctor = 2)
  let uid = uidInput.value.trim() ? Number(uidInput.value) : null;
  if (!uid) {
    uid = role === "patient" ? 1 : 2;
  }

  if (!appId) {
    setStatus("Enter App ID first");
    return;
  }

  if (!channel) {
    setStatus("Enter channel name");
    return;
  }

  joinBtn.disabled = true;

  try {
    client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

    client.on("user-joined", (user) => {
      console.log("Remote user joined:", user.uid);
      if (user.uid !== 3001 && user.uid !== 4001 && user.uid !== 5001) {
        activeViewers.add(user.uid);
      }
      if (!joinOrder.includes(user.uid)) {
        joinOrder.push(user.uid);
      }
      // Create viewer/remote card immediately on join (defaulting to placeholder)
      createRemotePlayer(user.uid, null);
      updateCardOrders();
    });

    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);

      if (mediaType === "video") {
        if (user.uid !== 3001 && user.uid !== 4001 && user.uid !== 5001) {
          activeViewers.add(user.uid);
        }

        const remotePlayer = createRemotePlayer(user.uid, user.videoTrack);
        remotePlayer.innerHTML = ""; // Clear placeholder
        user.videoTrack.play(remotePlayer, { fit: "contain" });

        const card = document.getElementById(`remote-card-${user.uid}`);
        if (card) {
          applyTrackAspectRatio(card, user.videoTrack);

          // Enable and activate camera control button
          const camBtn = card.querySelector(".camera-btn");
          if (camBtn) {
            camBtn.disabled = false;
            camBtn.className = "control-btn toggle-btn camera-btn active";
            camBtn.title = "Turn Camera OFF";
          }
        }

        if (!joinOrder.includes(user.uid)) {
          joinOrder.push(user.uid);
        }
        updateCardOrders();

        // Auto-focus the Patient's ultrasound feed (UID 5001) immediately if we are a Doctor
        if (roleInput.value === "doctor" && user.uid === 5001) {
          setTimeout(() => {
            const patientCard = document.getElementById("remote-card-5001");
            if (patientCard && !patientCard.classList.contains("pinned")) {
              togglePin(patientCard);
            }
          }, 300);
        }
      }

      if (mediaType === "audio") {
        user.audioTrack.play();
        if (user.uid === 4001) {
          const currentRole = roleInput.value;
          if (currentRole === "doctor") {
            console.log("Doctor subscribed to patient audio");
          } else if (currentRole === "viewer") {
            console.log("Viewer subscribed to patient audio");
          }
        }
        const card = document.getElementById(`remote-card-${user.uid}`);
        if (card) {
          const micBtn = card.querySelector(".mic-btn");
          if (micBtn) {
            micBtn.disabled = false;
            micBtn.className = "control-btn toggle-btn mic-btn active";
            micBtn.title = "Mute Microphone";
          }
        }
      }
    });

    client.on("user-unpublished", (user, mediaType) => {
      if (mediaType === "video") {
        const remotePlayer = document.getElementById(`remote-player-${user.uid}`);
        if (remotePlayer) {
          remotePlayer.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; gap: 8px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              No Camera Input (View-Only Mode)
            </div>
          `;
        }
        const card = document.getElementById(`remote-card-${user.uid}`);
        if (card) {
          const camBtn = card.querySelector(".camera-btn");
          if (camBtn) {
            camBtn.disabled = true;
            camBtn.className = "control-btn toggle-btn camera-btn inactive";
            camBtn.title = "Turn Camera ON";
          }
        }
      }

      if (mediaType === "audio") {
        const card = document.getElementById(`remote-card-${user.uid}`);
        if (card) {
          const micBtn = card.querySelector(".mic-btn");
          if (micBtn) {
            micBtn.disabled = true;
            micBtn.className = "control-btn toggle-btn mic-btn inactive";
            micBtn.title = "Mute Microphone";
          }
        }
      }
      updateCardOrders();
    });

    client.on("user-left", (user) => {
      console.log("Remote user left:", user.uid);
      const card = document.getElementById(`remote-card-${user.uid}`);
      if (card) {
        card.remove();
        zoomStates.delete(`remote-card-${user.uid}`);
      }

      const idx = joinOrder.indexOf(user.uid);
      if (idx !== -1) {
        joinOrder.splice(idx, 1);
      }
      if (user.uid !== 3001 && user.uid !== 4001 && user.uid !== 5001) {
        activeViewers.delete(user.uid);
      }
      updateCardOrders();
    });

    const joinedUid = await client.join(appId, channel, token, uid);
    uidInput.value = joinedUid;

    // Track local user join order
    if (!joinOrder.includes(joinedUid)) {
      joinOrder.push(joinedUid);
    }
    updateCardOrders();

    if (role === "viewer") {
      activeViewers.add(joinedUid);
    }

    // Cleanup any existing local tracks before acquiring new ones to prevent duplicate microphone tracks or leaks
    if (localTracks.audioTrack) {
      try {
        localTracks.audioTrack.stop();
        localTracks.audioTrack.close();
      } catch (e) {
        console.warn("Error cleaning up existing audio track:", e);
      }
      localTracks.audioTrack = null;
    }
    if (localTracks.videoTrack) {
      try {
        localTracks.videoTrack.stop();
        localTracks.videoTrack.close();
      } catch (e) {
        console.warn("Error cleaning up existing video track:", e);
      }
      localTracks.videoTrack = null;
    }

    // Acquire local media streams with full device fallbacks
    const { audioTrack, videoTrack } = await acquireLocalTracks(role, feedType);
    localTracks.audioTrack = audioTrack;
    localTracks.videoTrack = videoTrack;

    const publishTracks = [];

    // Handle Local Audio Preview & Publish State
    if (audioTrack) {
      publishTracks.push(audioTrack);
      muteBtn.disabled = false;
      localMicBtn.disabled = false;
      if (role === "patient") {
        const isMuted = localStorage.getItem("patient_mic_muted") === "true";
        await audioTrack.setEnabled(!isMuted);
        if (isMuted) {
          localMicBtn.classList.remove("active");
          localMicBtn.classList.add("inactive");
          localMicBtn.title = "Unmute Microphone";
          muteBtn.textContent = "Unmute Mic";
          muteBtn.classList.add("muted");
        } else {
          localMicBtn.classList.add("active");
          localMicBtn.classList.remove("inactive");
          localMicBtn.title = "Mute Microphone";
          muteBtn.textContent = "Mute Mic";
          muteBtn.classList.remove("muted");
        }
        syncSelfViewControls();
      } else {
        localMicBtn.classList.remove("inactive");
        localMicBtn.classList.add("active");
        localMicBtn.title = "Mute Microphone";
      }
    } else {
      muteBtn.disabled = true;
      localMicBtn.disabled = true;
      localMicBtn.classList.remove("active");
      localMicBtn.classList.add("inactive");
      console.log("No audio track acquired. Mic muted/disabled.");
    }

    // Handle Local Video Preview & Publish State
    if (videoTrack) {
      publishTracks.push(videoTrack);
      videoTrack.play(localPlayerEl, { fit: "contain" });
      applyTrackAspectRatio(localCard, videoTrack);

      localCameraBtn.disabled = false;
      localCameraBtn.classList.remove("inactive");
      localCameraBtn.classList.add("active");
      localCameraBtn.title = "Turn Camera OFF";

      const localTitle = localCard.querySelector(".video-header h2");
      if (localTitle) {
        if (uid === 5001) {
          localTitle.innerHTML = `🩺 Remote Ultrasound Feed`;
        } else if (role === "patient") {
          localTitle.innerHTML = `🩺 Patient Camera`;
        } else if (role === "doctor") {
          localTitle.innerHTML = `📹 Doctor Camera`;
        } else {
          const viewerNum = getViewerNumber(uid);
          localTitle.innerHTML = `👤 Viewer ${viewerNum} Camera`;
        }
      }

      // Screen share track end listener
      if (role === "patient" && feedType === "screen") {
        videoTrack.on("track-ended", () => {
          console.log("Local screen share track ended");
          leaveCall();
        });
      }
    } else {
      localCameraBtn.disabled = true;
      localCameraBtn.classList.remove("active");
      localCameraBtn.classList.add("inactive");
      // Show elegant View-Only placeholder when no video device is available or allowed
      localPlayerEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; gap: 8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          No Camera Input (View-Only Mode)
        </div>
      `;
      const localTitle = localCard.querySelector(".video-header h2");
      if (localTitle) {
        if (role === "patient") {
          localTitle.innerHTML = "🩺 Patient Camera (No Video)";
        } else if (role === "doctor") {
          localTitle.innerHTML = "📹 Doctor Camera (No Video)";
        } else {
          const viewerNum = getViewerNumber(uid);
          localTitle.innerHTML = `👤 Viewer ${viewerNum} Camera (No Video)`;
        }
      }
    }

    if (publishTracks.length > 0) {
      await client.publish(publishTracks);
      if (role === "patient" && audioTrack) {
        console.log("Patient microphone published");
      }
    }
    updateCardOrders();

    leaveBtn.disabled = false;
    muteBtn.disabled = false;

    // Show and start picture-in-picture floating self-view
    if (floatingSelfView) {
      resetFloatingSelfViewPosition();
      floatingSelfView.classList.add("show");
      startSelfViewMirror();
    }

    setStatus(`Connected to ${channel} as ${role === "patient" ? "Patient" : (role === "doctor" ? "Doctor" : "Viewer")}`);
  } catch (error) {
    const rawMessage = error?.message || String(error);

    if (rawMessage.includes("dynamic use static key")) {
      if (tokenText) {
        setStatus("Join failed: Token/App ID mode mismatch. Verify token or leave empty.");
      } else {
        setStatus("Join failed: Project requires an RTC token. Paste token in input.");
      }
    } else {
      setStatus(`Join failed: ${rawMessage}`);
    }

    if (client) {
      try {
        await client.leave();
      } catch (_) {
        // Ignore leave errors during failed join cleanup.
      }
      client.removeAllListeners();
      client = null;
    }

    joinBtn.disabled = false;
    muteBtn.disabled = true;
  }
}

async function leaveCall() {
  leaveBtn.disabled = true;
  muteBtn.disabled = true;
  localCameraBtn.disabled = true;
  localMicBtn.disabled = true;

  // Hide and stop self-view mirror
  if (floatingSelfView) {
    floatingSelfView.classList.remove("show");
    stopSelfViewMirror();
  }

  try {
    if (localTracks.audioTrack) {
      localTracks.audioTrack.stop();
      localTracks.audioTrack.close();
      localTracks.audioTrack = null;
    }

    if (localTracks.videoTrack) {
      localTracks.videoTrack.stop();
      localTracks.videoTrack.close();
      localTracks.videoTrack = null;
    }

    if (client) {
      await client.leave();
      client.removeAllListeners();
      client = null;
    }

    // Clean up all remote video cards from DOM
    const allCards = document.querySelectorAll(".video-card");
    allCards.forEach(card => {
      if (card.id !== "local-card") {
        card.remove();
      } else {
        // Reset local card states
        card.className = "video-card fit-contain";
        card.style.removeProperty("--video-aspect");
        card.classList.remove("has-aspect");

        const localTitle = localCard.querySelector(".video-header h2");
        if (localTitle) {
          localTitle.innerHTML = "📹 Local Feed";
        }

        const fitBtn = document.getElementById("local-fit-btn");
        if (fitBtn) {
          fitBtn.textContent = "Fit";
          fitBtn.classList.remove("active");
        }
        const pinBtn = document.getElementById("local-pin-btn");
        if (pinBtn) {
          pinBtn.textContent = "Focus";
          pinBtn.classList.remove("active");
        }

        // Remove local zoom indicator and reset translation
        const indicator = localPlayerEl.querySelector(".zoom-indicator");
        if (indicator) {
          indicator.remove();
        }
        localPlayerEl.style.cursor = "default";
      }
    });

    // Reset mute button text and style
    muteBtn.textContent = "Mute Mic";
    muteBtn.classList.remove("muted");

    // Reset local toggle buttons
    localMicBtn.classList.remove("inactive");
    localMicBtn.classList.add("active");
    localMicBtn.title = "Toggle Microphone";
    localCameraBtn.classList.remove("inactive");
    localCameraBtn.classList.add("active");
    localCameraBtn.title = "Toggle Camera";

    // Clear all remote states, keep only local state reset
    zoomStates.clear();
    zoomStates.set("local-card", {
      scale: 1.0,
      translateX: 0,
      translateY: 0,
      isDragging: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0
    });

    // Clear dynamic viewer states
    activeViewers.clear();
    viewerMap.clear();
    activeViewerTabKey = null;

    // Reset local card hierarchy if it was wrapped
    const playersContainer = document.getElementById("viewer-players-container");
    if (playersContainer) {
      localCard.appendChild(localPlayerEl);
      playersContainer.remove();
    }
    const tabsContainer = document.getElementById("viewer-card-tabs");
    if (tabsContainer) {
      tabsContainer.remove();
    }

    localPlayerEl.innerHTML = "";
    setStatus("Not connected");
  } catch (error) {
    setStatus(`Leave failed: ${error.message || error}`);
  } finally {
    joinBtn.disabled = false;
    leaveBtn.disabled = true;
    localCameraBtn.disabled = true;
    localMicBtn.disabled = true;
  }
}

joinBtn.addEventListener("click", joinCall);
leaveBtn.addEventListener("click", leaveCall);

// Settings Modal UI Interaction
const settingsModal = document.getElementById("settingsModal");
const settingsBtn = document.getElementById("settingsBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");

let originalSettings = {};

function openSettings() {
  originalSettings = {
    appId: appIdInput.value,
    channel: channelInput.value,
    role: roleInput.value,
    feedType: feedTypeInput.value,
    token: tokenInput.value,
    uid: uidInput.value
  };
  settingsModal.classList.add("active");
}

function closeSettings(save = false) {
  if (!save) {
    appIdInput.value = originalSettings.appId;
    channelInput.value = originalSettings.channel;
    roleInput.value = originalSettings.role;
    feedTypeInput.value = originalSettings.feedType;
    tokenInput.value = originalSettings.token;
    uidInput.value = originalSettings.uid;
    roleInput.dispatchEvent(new Event("change"));
  }
  settingsModal.classList.remove("active");
}

settingsBtn.addEventListener("click", openSettings);
closeModalBtn.addEventListener("click", () => closeSettings(false));
cancelSettingsBtn.addEventListener("click", () => closeSettings(false));
saveSettingsBtn.addEventListener("click", () => closeSettings(true));

settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) {
    closeSettings(false);
  }
});

// Role Selection screen card click handlers
const roleCards = document.querySelectorAll(".role-card-item");
const roleSelectionScreen = document.getElementById("role-selection-screen");
const appDashboard = document.getElementById("app-dashboard");

roleCards.forEach(card => {
  card.addEventListener("click", () => {
    const selectedRole = card.getAttribute("data-role");
    const selectedUid = card.getAttribute("data-uid");

    roleInput.value = selectedRole;
    uidInput.value = selectedUid;

    // Trigger settings updates (like feedType container visibility)
    roleInput.dispatchEvent(new Event("change"));

    // Navigate from selection page to dashboard
    roleSelectionScreen.style.display = "none";
    appDashboard.style.display = "flex";

    // Push history state to enable back button navigation integration
    if (window.history && window.history.pushState) {
      window.history.pushState({ page: "dashboard" }, "");
    }
  });
});

// Floating self-view controls listeners
if (selfViewCloseBtn) {
  selfViewCloseBtn.addEventListener("click", () => {
    if (floatingSelfView) {
      floatingSelfView.classList.remove("show");
    }
  });
}

if (selfViewCamBtn) {
  selfViewCamBtn.addEventListener("click", () => {
    if (localCameraBtn) {
      localCameraBtn.click();
    }
  });
}

if (selfViewMicBtn) {
  selfViewMicBtn.addEventListener("click", () => {
    if (localMicBtn) {
      localMicBtn.click();
    }
  });
}

if (selfViewMinimizeBtn) {
  selfViewMinimizeBtn.addEventListener("click", () => {
    if (floatingSelfView) {
      const isMinimized = floatingSelfView.classList.toggle("minimized");
      if (isMinimized) {
        selfViewMinimizeBtn.title = "Restore Self View";
        selfViewMinimizeBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        `;
      } else {
        selfViewMinimizeBtn.title = "Minimize Self View";
        selfViewMinimizeBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        `;
      }
    }
  });
}

// Drag-and-drop support restricted to viewport using the header
let isDraggingSelfView = false;
let dragStartX, dragStartY;
let dragInitialLeft, dragInitialTop;

const selfViewHeader = document.querySelector(".self-view-header");

if (selfViewHeader && floatingSelfView) {
  selfViewHeader.addEventListener("pointerdown", (e) => {
    // Only drag on left click for mouse
    if (e.pointerType === "mouse" && e.button !== 0) return;

    // Don't drag if clicking buttons inside the header
    if (e.target.closest(".self-view-btn")) return;

    const rect = floatingSelfView.getBoundingClientRect();

    // Initialize positions
    dragInitialLeft = rect.left;
    dragInitialTop = rect.top;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    // Set explicit position and clear transform for dragging
    floatingSelfView.style.left = `${dragInitialLeft}px`;
    floatingSelfView.style.top = `${dragInitialTop}px`;
    floatingSelfView.style.bottom = "auto";
    floatingSelfView.style.transform = "none";

    isDraggingSelfView = true;
    floatingSelfView.classList.add("dragging");
    selfViewHeader.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  selfViewHeader.addEventListener("pointermove", (e) => {
    if (!isDraggingSelfView) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    const rect = floatingSelfView.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newLeft = dragInitialLeft + dx;
    let newTop = dragInitialTop + dy;

    // Constrain within viewport
    const minLeft = 0;
    const maxLeft = viewportWidth - rect.width;
    const minTop = 0;
    const maxTop = viewportHeight - rect.height;

    newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
    newTop = Math.max(minTop, Math.min(maxTop, newTop));

    floatingSelfView.style.left = `${newLeft}px`;
    floatingSelfView.style.top = `${newTop}px`;
  });

  const handleDragEnd = (e) => {
    if (!isDraggingSelfView) return;
    isDraggingSelfView = false;
    floatingSelfView.classList.remove("dragging");
    selfViewHeader.releasePointerCapture(e.pointerId);
  };

  selfViewHeader.addEventListener("pointerup", handleDragEnd);
  selfViewHeader.addEventListener("pointercancel", handleDragEnd);
}

// Window resize handler to keep self view within viewport boundaries
window.addEventListener("resize", () => {
  if (floatingSelfView && floatingSelfView.style.left) {
    const rect = floatingSelfView.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let currentLeft = parseFloat(floatingSelfView.style.left);
    let currentTop = parseFloat(floatingSelfView.style.top);

    const maxLeft = viewportWidth - rect.width;
    const maxTop = viewportHeight - rect.height;

    currentLeft = Math.max(0, Math.min(maxLeft, currentLeft));
    currentTop = Math.max(0, Math.min(maxTop, currentTop));

    floatingSelfView.style.left = `${currentLeft}px`;
    floatingSelfView.style.top = `${currentTop}px`;
  }
});

if (backBtn) {
  backBtn.addEventListener("click", async () => {
    // If currently in a call, trigger leaveCall to disconnect and clean up safely
    if (leaveBtn && !leaveBtn.disabled) {
      try {
        await leaveCall();
      } catch (err) {
        console.warn("Error leaving call on back navigation:", err);
      }
    }

    // Attempt history navigation if history exists, with a fallback to direct SPA navigation
    if (window.history && window.history.length > 1) {
      window.history.back();
      // Safety fallback in case browser history does not transition state
      setTimeout(() => {
        if (appDashboard && appDashboard.style.display !== "none") {
          appDashboard.style.display = "none";
          roleSelectionScreen.style.display = "flex";
        }
      }, 100);
    } else {
      if (appDashboard && roleSelectionScreen) {
        appDashboard.style.display = "none";
        roleSelectionScreen.style.display = "flex";
      }
    }
  });
}

// Listen for browser back/forward navigation to update SPA UI states and safely leave active calls
window.addEventListener("popstate", async (event) => {
  const isDashboard = event.state && event.state.page === "dashboard";
  if (isDashboard) {
    if (roleSelectionScreen && appDashboard) {
      roleSelectionScreen.style.display = "none";
      appDashboard.style.display = "flex";
    }
  } else {
    // If currently in a call, trigger leaveCall to disconnect and clean up safely
    if (leaveBtn && !leaveBtn.disabled) {
      try {
        await leaveCall();
      } catch (err) {
        console.warn("Error leaving call on back navigation:", err);
      }
    }
    if (roleSelectionScreen && appDashboard) {
      appDashboard.style.display = "none";
      roleSelectionScreen.style.display = "flex";
    }
  }
});

// ==========================================================================
// POP-OUT / NEW WINDOW DOCTOR CAMERA LOGIC
// ==========================================================================

function getDoctorCard() {
  const remoteCard = document.getElementById("remote-card-3001");
  if (remoteCard) return remoteCard;
  const localUidVal = uidInput.value.trim() ? Number(uidInput.value) : (roleInput.value === "patient" ? 4001 : 3001);
  if (localUidVal === 3001) {
    return document.getElementById("local-card");
  }
  return null;
}

function syncDoctorPopoutPlayer() {
  if (!doctorPopoutWindow || doctorPopoutWindow.closed) return;

  const popoutCard = doctorPopoutWindow.document.getElementById("popout-card");
  const popoutPlayer = doctorPopoutWindow.document.getElementById("popout-player");
  if (!popoutCard || !popoutPlayer) return;

  const parentCard = getDoctorCard();
  if (!parentCard) {
    // Show placeholder if card is not present
    if (!popoutPlayer.querySelector(".placeholder-container")) {
      popoutPlayer.innerHTML = `
        <div class="placeholder-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; gap: 8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          No Camera Input (View-Only Mode)
        </div>
      `;
    }
    return;
  }

  const parentPlayer = parentCard.id === "local-card" ? localPlayerEl : parentCard.querySelector(".remote-player");
  const parentVideo = parentPlayer ? parentPlayer.querySelector("video") : null;

  if (parentVideo && parentVideo.srcObject) {
    // Check if the popout already has a video element
    let childVideo = popoutPlayer.querySelector("video");
    if (!childVideo) {
      popoutPlayer.innerHTML = ""; // Clear placeholder
      childVideo = doctorPopoutWindow.document.createElement("video");
      childVideo.autoplay = true;
      childVideo.playsInline = true;
      childVideo.muted = true;
      childVideo.style.width = "100%";
      childVideo.style.height = "100%";
      childVideo.style.display = "block";
      popoutPlayer.appendChild(childVideo);
    }
    // Only update srcObject if it has changed
    if (childVideo.srcObject !== parentVideo.srcObject) {
      childVideo.srcObject = parentVideo.srcObject;
      childVideo.play().catch(err => console.error("Error playing child video:", err));
    }

    // Mirror zoom transformation classes and aspect ratios
    if (parentCard.style.getPropertyValue("--video-aspect")) {
      popoutCard.style.setProperty("--video-aspect", parentCard.style.getPropertyValue("--video-aspect"));
    }
    if (parentCard.classList.contains("has-aspect")) {
      popoutCard.classList.add("has-aspect");
    } else {
      popoutCard.classList.remove("has-aspect");
    }

    // Apply exact zoom from parent to maintain zoom state initially or during parent zoom actions
    const parentZoom = zoomStates.get(parentCard.id);
    const popoutZoom = zoomStates.get("doctor-popout-card");
    if (parentZoom && (!popoutZoom || popoutZoom.scale !== parentZoom.scale || popoutZoom.translateX !== parentZoom.translateX || popoutZoom.translateY !== parentZoom.translateY)) {
      zoomStates.set("doctor-popout-card", { ...parentZoom });
      applyZoomTransform(popoutCard, popoutPlayer);
    }
  } else {
    // Parent video doesn't exist, show placeholder
    if (!popoutPlayer.querySelector(".placeholder-container")) {
      popoutPlayer.innerHTML = `
        <div class="placeholder-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; gap: 8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          No Camera Input (View-Only Mode)
        </div>
      `;
    }
  }
}

function syncDoctorPopoutControls() {
  if (!doctorPopoutWindow || doctorPopoutWindow.closed) return;

  const parentCard = getDoctorCard();
  if (!parentCard) return;

  const popoutCard = doctorPopoutWindow.document.getElementById("popout-card");
  if (!popoutCard) return;

  // Sync Camera button state
  const parentCamBtn = parentCard.querySelector(".camera-btn");
  const childCamBtn = doctorPopoutWindow.document.getElementById("popout-camera-btn");
  if (parentCamBtn && childCamBtn) {
    childCamBtn.disabled = parentCamBtn.disabled;
    if (parentCamBtn.classList.contains("active")) {
      childCamBtn.classList.add("active");
      childCamBtn.classList.remove("inactive");
      childCamBtn.title = "Turn Camera OFF";
    } else {
      childCamBtn.classList.add("inactive");
      childCamBtn.classList.remove("active");
      childCamBtn.title = "Turn Camera ON";
    }
  }

  // Sync Mic (Mute) button state
  const parentMicBtn = parentCard.querySelector(".mic-btn");
  const childMicBtn = doctorPopoutWindow.document.getElementById("popout-mic-btn");
  if (parentMicBtn && childMicBtn) {
    childMicBtn.disabled = parentMicBtn.disabled;
    if (parentMicBtn.classList.contains("active")) {
      childMicBtn.classList.add("active");
      childMicBtn.classList.remove("inactive");
      childMicBtn.title = "Mute Microphone";
    } else {
      childMicBtn.classList.add("inactive");
      childMicBtn.classList.remove("active");
      childMicBtn.title = "Unmute Microphone";
    }
  }

  // Sync Fit button text and active state
  const childFitBtn = doctorPopoutWindow.document.getElementById("popout-fit-btn");
  if (childFitBtn) {
    if (parentCard.classList.contains("fit-contain")) {
      popoutCard.classList.remove("fit-cover");
      popoutCard.classList.add("fit-contain");
      childFitBtn.textContent = "Fit";
      childFitBtn.classList.remove("active");
    } else {
      popoutCard.classList.remove("fit-contain");
      popoutCard.classList.add("fit-cover");
      childFitBtn.textContent = "Fill";
      childFitBtn.classList.add("active");
    }
  }

  // Sync Focus button state
  const childPinBtn = doctorPopoutWindow.document.getElementById("popout-pin-btn");
  if (childPinBtn) {
    if (parentCard.classList.contains("pinned")) {
      popoutCard.classList.add("pinned");
      childPinBtn.textContent = "Unfocus";
      childPinBtn.classList.add("active");
    } else {
      popoutCard.classList.remove("pinned");
      childPinBtn.textContent = "Focus";
      childPinBtn.classList.remove("active");
    }
  }
}

function openDoctorPopoutWindow() {
  if (doctorPopoutWindow && !doctorPopoutWindow.closed) {
    doctorPopoutWindow.focus();
    return;
  }

  doctorPopoutWindow = window.open("", "DoctorPopout", "width=1024,height=768,menubar=no,toolbar=no,location=no,status=no");
  if (!doctorPopoutWindow) {
    alert("Popup blocked! Please allow popups for this page to view the popout doctor camera feed.");
    return;
  }

  const doc = doctorPopoutWindow.document;
  doc.open();
  doc.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Doctor Camera</title>
</head>
<body class="popout-body" style="margin: 0; padding: 0; background: #060B18; overflow: hidden; height: 100vh;">
  <div class="video-card fit-contain" id="popout-card" style="width: 100%; height: 100vh; margin: 0; border: none; border-radius: 0; box-shadow: none; display: flex; flex-direction: column;">
    <div class="video-header" style="padding: 12px 20px; flex-shrink: 0;">
      <h2>📹 Doctor Camera</h2>
      <div class="video-controls">
        <button class="control-btn toggle-btn camera-btn" id="popout-camera-btn" type="button" title="Toggle Camera">
          <svg class="icon-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 7l-7 5 7 5V7z"></path>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
          <svg class="icon-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10l-2.58-1.84M23 7l-7 5 7 5V7z"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        </button>
        <button class="control-btn toggle-btn mic-btn" id="popout-mic-btn" type="button" title="Toggle Microphone">
          <svg class="icon-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
          <svg class="icon-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 11a5 5 0 0 1-5 5m-3.87-1.17A7 7 0 0 1 5 10v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>
        <button class="control-btn zoom-out-btn" id="popout-zoom-out-btn" type="button" title="Zoom Out">-</button>
        <button class="control-btn zoom-in-btn" id="popout-zoom-in-btn" type="button" title="Zoom In">+</button>
        <button class="control-btn fit-btn" id="popout-fit-btn" type="button" title="Toggle Fit/Fill Mode">Fit</button>
        <button class="control-btn pin-btn" id="popout-pin-btn" type="button" title="Focus Feed">Focus</button>
      </div>
    </div>
    <div id="popout-player" class="remote-player" style="flex: 1; position: relative; overflow: hidden; background: #000;">
    </div>
  </div>
</body>
</html>
  `);
  doc.close();

  // Dynamically copy stylesheet links & styles, setting base href to resolve relatives
  const base = doc.createElement("base");
  base.href = window.location.href;
  doc.head.appendChild(base);

  document.querySelectorAll('link, style').forEach(el => {
    doc.head.appendChild(el.cloneNode(true));
  });

  const popoutCard = doc.getElementById("popout-card");
  const popoutPlayer = doc.getElementById("popout-player");

  // Setup Zoom and Pan pointer events
  setupZoomAndPan(popoutCard, popoutPlayer);

  // Set click event handlers for controls in child window
  doc.getElementById("popout-camera-btn").addEventListener("click", () => {
    const parentCard = getDoctorCard();
    if (parentCard) {
      const btn = parentCard.querySelector(".camera-btn");
      if (btn) btn.click();
    }
  });

  doc.getElementById("popout-mic-btn").addEventListener("click", () => {
    const parentCard = getDoctorCard();
    if (parentCard) {
      const btn = parentCard.querySelector(".mic-btn");
      if (btn) btn.click();
    }
  });

  doc.getElementById("popout-zoom-out-btn").addEventListener("click", () => {
    adjustZoom(popoutCard, popoutPlayer, -0.25);
  });

  doc.getElementById("popout-zoom-in-btn").addEventListener("click", () => {
    adjustZoom(popoutCard, popoutPlayer, 0.25);
  });

  doc.getElementById("popout-fit-btn").addEventListener("click", () => {
    const btn = doc.getElementById("popout-fit-btn");
    toggleFit(popoutCard, btn);
  });

  doc.getElementById("popout-pin-btn").addEventListener("click", () => {
    const parentCard = getDoctorCard();
    if (parentCard) {
      togglePin(parentCard);
    }
  });

  // Perform initial sync
  syncDoctorPopoutPlayer();
  syncDoctorPopoutControls();

  // Register unload cleanup
  doctorPopoutWindow.addEventListener("unload", () => {
    doctorPopoutWindow = null;
  });
}

// ==========================================================================
// POP-OUT / NEW WINDOW ULTRASOUND FEED LOGIC
// ==========================================================================

function getUltrasoundCard() {
  const remoteCard = document.getElementById("remote-card-5001");
  if (remoteCard) return remoteCard;
  const localUidVal = uidInput.value.trim() ? Number(uidInput.value) : (roleInput.value === "patient" ? 4001 : 3001);
  if (localUidVal === 5001) {
    return document.getElementById("local-card");
  }
  return null;
}

function getUltrasoundVideoTrack() {
  const localUidVal = uidInput.value.trim() ? Number(uidInput.value) : (roleInput.value === "patient" ? 4001 : 3001);
  if (localUidVal === 5001) {
    return localTracks.videoTrack;
  }
  const user = client?.remoteUsers.find(u => u.uid === 5001);
  return user?.videoTrack || null;
}

function syncPopoutPlayer() {
  if (!popoutWindow || popoutWindow.closed) return;

  const popoutCard = popoutWindow.document.getElementById("popout-card");
  const popoutPlayer = popoutWindow.document.getElementById("popout-player");
  if (!popoutCard || !popoutPlayer) return;

  const parentCard = getUltrasoundCard();
  if (!parentCard) {
    // Show placeholder if card is not present
    if (!popoutPlayer.querySelector(".placeholder-container")) {
      popoutPlayer.innerHTML = `
        <div class="placeholder-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; gap: 8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          No Camera Input (View-Only Mode)
        </div>
      `;
    }
    return;
  }

  const parentPlayer = parentCard.id === "local-card" ? localPlayerEl : parentCard.querySelector(".remote-player");
  const parentVideo = parentPlayer ? parentPlayer.querySelector("video") : null;

  if (parentVideo && parentVideo.srcObject) {
    // Check if the popout already has a video element
    let childVideo = popoutPlayer.querySelector("video");
    if (!childVideo) {
      popoutPlayer.innerHTML = ""; // Clear placeholder
      childVideo = popoutWindow.document.createElement("video");
      childVideo.autoplay = true;
      childVideo.playsInline = true;
      childVideo.muted = true;
      childVideo.style.width = "100%";
      childVideo.style.height = "100%";
      childVideo.style.display = "block";
      popoutPlayer.appendChild(childVideo);
    }
    // Only update srcObject if it has changed
    if (childVideo.srcObject !== parentVideo.srcObject) {
      childVideo.srcObject = parentVideo.srcObject;
      childVideo.play().catch(err => console.error("Error playing child video:", err));
    }

    // Mirror zoom transformation classes and aspect ratios
    if (parentCard.style.getPropertyValue("--video-aspect")) {
      popoutCard.style.setProperty("--video-aspect", parentCard.style.getPropertyValue("--video-aspect"));
    }
    if (parentCard.classList.contains("has-aspect")) {
      popoutCard.classList.add("has-aspect");
    } else {
      popoutCard.classList.remove("has-aspect");
    }

    // Apply exact zoom from parent to maintain zoom state initially or during parent zoom actions
    const parentZoom = zoomStates.get(parentCard.id);
    const popoutZoom = zoomStates.get("popout-card");
    if (parentZoom && (!popoutZoom || popoutZoom.scale !== parentZoom.scale || popoutZoom.translateX !== parentZoom.translateX || popoutZoom.translateY !== parentZoom.translateY)) {
      zoomStates.set("popout-card", { ...parentZoom });
      applyZoomTransform(popoutCard, popoutPlayer);
    }
  } else {
    // Parent video doesn't exist, show placeholder
    if (!popoutPlayer.querySelector(".placeholder-container")) {
      popoutPlayer.innerHTML = `
        <div class="placeholder-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; gap: 8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          No Camera Input (View-Only Mode)
        </div>
      `;
    }
  }
}

function syncPopoutControls() {
  if (!popoutWindow || popoutWindow.closed) return;

  const parentCard = getUltrasoundCard();
  if (!parentCard) return;

  const popoutCard = popoutWindow.document.getElementById("popout-card");
  if (!popoutCard) return;

  // Sync Camera button state
  const parentCamBtn = parentCard.querySelector(".camera-btn");
  const childCamBtn = popoutWindow.document.getElementById("popout-camera-btn");
  if (parentCamBtn && childCamBtn) {
    childCamBtn.disabled = parentCamBtn.disabled;
    if (parentCamBtn.classList.contains("active")) {
      childCamBtn.classList.add("active");
      childCamBtn.classList.remove("inactive");
      childCamBtn.title = "Turn Camera OFF";
    } else {
      childCamBtn.classList.add("inactive");
      childCamBtn.classList.remove("active");
      childCamBtn.title = "Turn Camera ON";
    }
  }

  // Sync Mic (Mute) button state
  const parentMicBtn = parentCard.querySelector(".mic-btn");
  const childMicBtn = popoutWindow.document.getElementById("popout-mic-btn");
  if (parentMicBtn && childMicBtn) {
    childMicBtn.disabled = parentMicBtn.disabled;
    if (parentMicBtn.classList.contains("active")) {
      childMicBtn.classList.add("active");
      childMicBtn.classList.remove("inactive");
      childMicBtn.title = "Mute Microphone";
    } else {
      childMicBtn.classList.add("inactive");
      childMicBtn.classList.remove("active");
      childMicBtn.title = "Unmute Microphone";
    }
  }

  // Sync Fit button text and active state
  const childFitBtn = popoutWindow.document.getElementById("popout-fit-btn");
  if (childFitBtn) {
    if (parentCard.classList.contains("fit-contain")) {
      popoutCard.classList.remove("fit-cover");
      popoutCard.classList.add("fit-contain");
      childFitBtn.textContent = "Fit";
      childFitBtn.classList.remove("active");
    } else {
      popoutCard.classList.remove("fit-contain");
      popoutCard.classList.add("fit-cover");
      childFitBtn.textContent = "Fill";
      childFitBtn.classList.add("active");
    }
  }

  // Sync Focus button state
  const childPinBtn = popoutWindow.document.getElementById("popout-pin-btn");
  if (childPinBtn) {
    if (parentCard.classList.contains("pinned")) {
      popoutCard.classList.add("pinned");
      childPinBtn.textContent = "Unfocus";
      childPinBtn.classList.add("active");
    } else {
      popoutCard.classList.remove("pinned");
      childPinBtn.textContent = "Focus";
      childPinBtn.classList.remove("active");
    }
  }
}

function openPopoutWindow() {
  if (popoutWindow && !popoutWindow.closed) {
    popoutWindow.focus();
    return;
  }

  popoutWindow = window.open("", "UltrasoundPopout", "width=1024,height=768,menubar=no,toolbar=no,location=no,status=no");
  if (!popoutWindow) {
    alert("Popup blocked! Please allow popups for this page to view the popout ultrasound feed.");
    return;
  }

  const doc = popoutWindow.document;
  doc.open();
  doc.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Remote Ultrasound Feed</title>
</head>
<body class="popout-body" style="margin: 0; padding: 0; background: #060B18; overflow: hidden; height: 100vh;">
  <div class="video-card fit-contain" id="popout-card" style="width: 100%; height: 100vh; margin: 0; border: none; border-radius: 0; box-shadow: none; display: flex; flex-direction: column;">
    <div class="video-header" style="padding: 12px 20px; flex-shrink: 0;">
      <h2>🩺 Remote Ultrasound Feed</h2>
      <div class="video-controls">
        <button class="control-btn toggle-btn camera-btn" id="popout-camera-btn" type="button" title="Toggle Camera">
          <svg class="icon-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 7l-7 5 7 5V7z"></path>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
          <svg class="icon-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10l-2.58-1.84M23 7l-7 5 7 5V7z"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        </button>
        <button class="control-btn toggle-btn mic-btn" id="popout-mic-btn" type="button" title="Toggle Microphone">
          <svg class="icon-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
          <svg class="icon-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 11a5 5 0 0 1-5 5m-3.87-1.17A7 7 0 0 1 5 10v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>
        <button class="control-btn zoom-out-btn" id="popout-zoom-out-btn" type="button" title="Zoom Out">-</button>
        <button class="control-btn zoom-in-btn" id="popout-zoom-in-btn" type="button" title="Zoom In">+</button>
        <button class="control-btn fit-btn" id="popout-fit-btn" type="button" title="Toggle Fit/Fill Mode">Fit</button>
        <button class="control-btn pin-btn" id="popout-pin-btn" type="button" title="Focus Feed">Focus</button>
      </div>
    </div>
    <div id="popout-player" class="remote-player" style="flex: 1; position: relative; overflow: hidden; background: #000;">
    </div>
  </div>
</body>
</html>
  `);
  doc.close();

  // Dynamically copy stylesheet links & styles, setting base href to resolve relatives
  const base = doc.createElement("base");
  base.href = window.location.href;
  doc.head.appendChild(base);

  document.querySelectorAll('link, style').forEach(el => {
    doc.head.appendChild(el.cloneNode(true));
  });

  const popoutCard = doc.getElementById("popout-card");
  const popoutPlayer = doc.getElementById("popout-player");

  // Setup Zoom and Pan pointer events
  setupZoomAndPan(popoutCard, popoutPlayer);

  // Set click event handlers for controls in child window
  doc.getElementById("popout-camera-btn").addEventListener("click", () => {
    const parentCard = getUltrasoundCard();
    if (parentCard) {
      const btn = parentCard.querySelector(".camera-btn");
      if (btn) btn.click();
    }
  });

  doc.getElementById("popout-mic-btn").addEventListener("click", () => {
    const parentCard = getUltrasoundCard();
    if (parentCard) {
      const btn = parentCard.querySelector(".mic-btn");
      if (btn) btn.click();
    }
  });

  doc.getElementById("popout-zoom-out-btn").addEventListener("click", () => {
    adjustZoom(popoutCard, popoutPlayer, -0.25);
  });

  doc.getElementById("popout-zoom-in-btn").addEventListener("click", () => {
    adjustZoom(popoutCard, popoutPlayer, 0.25);
  });

  doc.getElementById("popout-fit-btn").addEventListener("click", () => {
    const btn = doc.getElementById("popout-fit-btn");
    toggleFit(popoutCard, btn);
  });

  doc.getElementById("popout-pin-btn").addEventListener("click", () => {
    const parentCard = getUltrasoundCard();
    if (parentCard) {
      togglePin(parentCard);
    }
  });

  // Perform initial sync
  syncPopoutPlayer();
  syncPopoutControls();

  // Register unload cleanup
  popoutWindow.addEventListener("unload", () => {
    popoutWindow = null;
  });
}

// Clean up popouts when parent window closes
window.addEventListener("beforeunload", () => {
  if (popoutWindow && !popoutWindow.closed) {
    popoutWindow.close();
  }
  if (doctorPopoutWindow && !doctorPopoutWindow.closed) {
    doctorPopoutWindow.close();
  }
  if (patientPopoutWindow && !patientPopoutWindow.closed) {
    patientPopoutWindow.close();
  }
  for (const win of viewerPopoutWindows.values()) {
    if (win && !win.closed) {
      win.close();
    }
  }
});

// Periodic synchronization loop
setInterval(() => {
  if (popoutWindow && !popoutWindow.closed) {
    syncPopoutPlayer();
    syncPopoutControls();
  }
  if (doctorPopoutWindow && !doctorPopoutWindow.closed) {
    syncDoctorPopoutPlayer();
    syncDoctorPopoutControls();
  }
  if (patientPopoutWindow && !patientPopoutWindow.closed) {
    syncGenericPopoutPlayer(4001, patientPopoutWindow);
    syncGenericPopoutControls(4001, patientPopoutWindow);
  }
  for (const [uid, win] of viewerPopoutWindows.entries()) {
    if (win && !win.closed) {
      syncGenericPopoutPlayer(uid, win);
      syncGenericPopoutControls(uid, win);
    }
  }
}, 250);

// ==========================================================================
// GENERIC POP-OUT WINDOW LOGIC (FOR PATIENT & VIEWER CAMERA CARDS)
// ==========================================================================

function getCardByUid(uid) {
  const remoteCard = document.getElementById(`remote-card-${uid}`);
  if (remoteCard) return remoteCard;
  const localUidVal = uidInput.value.trim() ? Number(uidInput.value) : (roleInput.value === "patient" ? 4001 : 3001);
  if (localUidVal === uid) {
    return document.getElementById("local-card");
  }
  return null;
}

function syncGenericPopoutPlayer(uid, popWindow) {
  if (!popWindow || popWindow.closed) return;

  const popoutCard = popWindow.document.getElementById("popout-card");
  const popoutPlayer = popWindow.document.getElementById("popout-player");
  if (!popoutCard || !popoutPlayer) return;

  const parentCard = getCardByUid(uid);
  if (!parentCard) {
    // Show placeholder if card is not present
    if (!popoutPlayer.querySelector(".placeholder-container")) {
      popoutPlayer.innerHTML = `
        <div class="placeholder-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; gap: 8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          No Camera Input (View-Only Mode)
        </div>
      `;
    }
    return;
  }

  const parentPlayer = parentCard.id === "local-card" ? localPlayerEl : parentCard.querySelector(".remote-player");
  const parentVideo = parentPlayer ? parentPlayer.querySelector("video") : null;

  if (parentVideo && parentVideo.srcObject) {
    // Check if the popout already has a video element
    let childVideo = popoutPlayer.querySelector("video");
    if (!childVideo) {
      popoutPlayer.innerHTML = ""; // Clear placeholder
      childVideo = popWindow.document.createElement("video");
      childVideo.autoplay = true;
      childVideo.playsInline = true;
      childVideo.muted = true;
      childVideo.style.width = "100%";
      childVideo.style.height = "100%";
      childVideo.style.display = "block";
      popoutPlayer.appendChild(childVideo);
    }
    // Only update srcObject if it has changed
    if (childVideo.srcObject !== parentVideo.srcObject) {
      childVideo.srcObject = parentVideo.srcObject;
      childVideo.play().catch(err => console.error(`Error playing child video for UID ${uid}:`, err));
    }

    // Mirror zoom transformation classes and aspect ratios
    if (parentCard.style.getPropertyValue("--video-aspect")) {
      popoutCard.style.setProperty("--video-aspect", parentCard.style.getPropertyValue("--video-aspect"));
    }
    if (parentCard.classList.contains("has-aspect")) {
      popoutCard.classList.add("has-aspect");
    } else {
      popoutCard.classList.remove("has-aspect");
    }

    // Apply exact zoom from parent to maintain zoom state initially or during parent zoom actions
    const parentZoom = zoomStates.get(parentCard.id);
    const popoutZoom = zoomStates.get(`popout-card-${uid}`);
    if (parentZoom && (!popoutZoom || popoutZoom.scale !== parentZoom.scale || popoutZoom.translateX !== parentZoom.translateX || popoutZoom.translateY !== parentZoom.translateY)) {
      zoomStates.set(`popout-card-${uid}`, { ...parentZoom });
      applyZoomTransform(popoutCard, popoutPlayer);
    }
  } else {
    // Parent video doesn't exist, show placeholder
    if (!popoutPlayer.querySelector(".placeholder-container")) {
      popoutPlayer.innerHTML = `
        <div class="placeholder-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; gap: 8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          No Camera Input (View-Only Mode)
        </div>
      `;
    }
  }
}

function syncGenericPopoutControls(uid, popWindow) {
  if (!popWindow || popWindow.closed) return;

  const parentCard = getCardByUid(uid);
  if (!parentCard) return;

  const popoutCard = popWindow.document.getElementById("popout-card");
  if (!popoutCard) return;

  // Sync Camera button state
  const parentCamBtn = parentCard.querySelector(".camera-btn");
  const childCamBtn = popWindow.document.getElementById("popout-camera-btn");
  if (parentCamBtn && childCamBtn) {
    childCamBtn.disabled = parentCamBtn.disabled;
    if (parentCamBtn.classList.contains("active")) {
      childCamBtn.classList.add("active");
      childCamBtn.classList.remove("inactive");
      childCamBtn.title = "Turn Camera OFF";
    } else {
      childCamBtn.classList.add("inactive");
      childCamBtn.classList.remove("active");
      childCamBtn.title = "Turn Camera ON";
    }
  }

  // Sync Mic (Mute) button state
  const parentMicBtn = parentCard.querySelector(".mic-btn");
  const childMicBtn = popWindow.document.getElementById("popout-mic-btn");
  if (parentMicBtn && childMicBtn) {
    childMicBtn.disabled = parentMicBtn.disabled;
    if (parentMicBtn.classList.contains("active")) {
      childMicBtn.classList.add("active");
      childMicBtn.classList.remove("inactive");
      childMicBtn.title = "Mute Microphone";
    } else {
      childMicBtn.classList.add("inactive");
      childMicBtn.classList.remove("active");
      childMicBtn.title = "Unmute Microphone";
    }
  }

  // Sync Fit button text and active state
  const childFitBtn = popWindow.document.getElementById("popout-fit-btn");
  if (childFitBtn) {
    if (parentCard.classList.contains("fit-contain")) {
      popoutCard.classList.remove("fit-cover");
      popoutCard.classList.add("fit-contain");
      childFitBtn.textContent = "Fit";
      childFitBtn.classList.remove("active");
    } else {
      popoutCard.classList.remove("fit-contain");
      popoutCard.classList.add("fit-cover");
      childFitBtn.textContent = "Fill";
      childFitBtn.classList.add("active");
    }
  }

  // Sync Focus button state
  const childPinBtn = popWindow.document.getElementById("popout-pin-btn");
  if (childPinBtn) {
    if (parentCard.classList.contains("pinned")) {
      popoutCard.classList.add("pinned");
      childPinBtn.textContent = "Unfocus";
      childPinBtn.classList.add("active");
    } else {
      popoutCard.classList.remove("pinned");
      childPinBtn.textContent = "Focus";
      childPinBtn.classList.remove("active");
    }
  }
}

function openGenericPopoutWindow(uid) {
  let popWindow = null;
  let windowName = "";
  let titleText = "";
  let h2Text = "";

  if (uid === 4001) {
    if (patientPopoutWindow && !patientPopoutWindow.closed) {
      patientPopoutWindow.focus();
      return;
    }
    windowName = "PatientPopout";
    titleText = "Patient Camera";
    h2Text = "🩺 Patient Camera";
  } else {
    if (viewerPopoutWindows.has(uid)) {
      const existingWin = viewerPopoutWindows.get(uid);
      if (existingWin && !existingWin.closed) {
        existingWin.focus();
        return;
      }
    }
    const viewerNum = getViewerNumber(uid);
    windowName = `ViewerPopout_${uid}`;
    titleText = `Viewer ${viewerNum} Camera`;
    h2Text = `👤 Viewer ${viewerNum} Camera`;
  }

  popWindow = window.open("", windowName, "width=1024,height=768,menubar=no,toolbar=no,location=no,status=no");
  if (!popWindow) {
    alert(`Popup blocked! Please allow popups for this page to view the popout for ${titleText}.`);
    return;
  }

  if (uid === 4001) {
    patientPopoutWindow = popWindow;
  } else {
    viewerPopoutWindows.set(uid, popWindow);
  }

  const doc = popWindow.document;
  doc.open();
  doc.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${titleText}</title>
</head>
<body class="popout-body" style="margin: 0; padding: 0; background: #060B18; overflow: hidden; height: 100vh;">
  <div class="video-card fit-contain" id="popout-card" style="width: 100%; height: 100vh; margin: 0; border: none; border-radius: 0; box-shadow: none; display: flex; flex-direction: column;">
    <div class="video-header" style="padding: 12px 20px; flex-shrink: 0;">
      <h2>${h2Text}</h2>
      <div class="video-controls">
        <button class="control-btn toggle-btn camera-btn" id="popout-camera-btn" type="button" title="Toggle Camera">
          <svg class="icon-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 7l-7 5 7 5V7z"></path>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
          <svg class="icon-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10l-2.58-1.84M23 7l-7 5 7 5V7z"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        </button>
        <button class="control-btn toggle-btn mic-btn" id="popout-mic-btn" type="button" title="Toggle Microphone">
          <svg class="icon-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
          <svg class="icon-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 11a5 5 0 0 1-5 5m-3.87-1.17A7 7 0 0 1 5 10v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>
        <button class="control-btn zoom-out-btn" id="popout-zoom-out-btn" type="button" title="Zoom Out">-</button>
        <button class="control-btn zoom-in-btn" id="popout-zoom-in-btn" type="button" title="Zoom In">+</button>
        <button class="control-btn fit-btn" id="popout-fit-btn" type="button" title="Toggle Fit/Fill Mode">Fit</button>
        <button class="control-btn pin-btn" id="popout-pin-btn" type="button" title="Focus Feed">Focus</button>
      </div>
    </div>
    <div id="popout-player" class="remote-player" style="flex: 1; position: relative; overflow: hidden; background: #000;">
    </div>
  </div>
</body>
</html>
  `);
  doc.close();

  const base = doc.createElement("base");
  base.href = window.location.href;
  doc.head.appendChild(base);

  document.querySelectorAll('link, style').forEach(el => {
    doc.head.appendChild(el.cloneNode(true));
  });

  const popoutCard = doc.getElementById("popout-card");
  const popoutPlayer = doc.getElementById("popout-player");

  setupZoomAndPan(popoutCard, popoutPlayer);

  doc.getElementById("popout-camera-btn").addEventListener("click", () => {
    const parentCard = getCardByUid(uid);
    if (parentCard) {
      const btn = parentCard.querySelector(".camera-btn");
      if (btn) btn.click();
    }
  });

  doc.getElementById("popout-mic-btn").addEventListener("click", () => {
    const parentCard = getCardByUid(uid);
    if (parentCard) {
      const btn = parentCard.querySelector(".mic-btn");
      if (btn) btn.click();
    }
  });

  doc.getElementById("popout-zoom-out-btn").addEventListener("click", () => {
    adjustZoom(popoutCard, popoutPlayer, -0.25);
  });

  doc.getElementById("popout-zoom-in-btn").addEventListener("click", () => {
    adjustZoom(popoutCard, popoutPlayer, 0.25);
  });

  doc.getElementById("popout-fit-btn").addEventListener("click", () => {
    const btn = doc.getElementById("popout-fit-btn");
    toggleFit(popoutCard, btn);
  });

  doc.getElementById("popout-pin-btn").addEventListener("click", () => {
    const parentCard = getCardByUid(uid);
    if (parentCard) {
      togglePin(parentCard);
    }
  });

  syncGenericPopoutPlayer(uid, popWindow);
  syncGenericPopoutControls(uid, popWindow);

  popWindow.addEventListener("unload", () => {
    if (uid === 4001) {
      patientPopoutWindow = null;
    } else {
      viewerPopoutWindows.delete(uid);
    }
  });
}
