const STORAGE_KEY = "familieVideoPersonerV4";
const DB_NAME = "familieVideoDBV4";
const DB_VERSION = 1;
const STORE_NAME = "videos";

const familyGrid = document.getElementById("familyGrid");
const adminModal = document.getElementById("adminModal");
const formModal = document.getElementById("formModal");
const hiddenAdminLogo = document.getElementById("hiddenAdminLogo");
const closeAdminBtn = document.getElementById("closeAdminBtn");
const newPersonBtn = document.getElementById("newPersonBtn");
const adminList = document.getElementById("adminList");

const formTitle = document.getElementById("formTitle");
const editId = document.getElementById("editId");
const nameInput = document.getElementById("nameInput");
const relationInput = document.getElementById("relationInput");
const videoInput = document.getElementById("videoInput");
const favoriteInput = document.getElementById("favoriteInput");
const saveBtn = document.getElementById("saveBtn");
const cancelFormBtn = document.getElementById("cancelFormBtn");

let people = loadPeople();
let tapCount = 0;
let tapTimer = null;
let selectedVideoFile = null;
let selectedThumbnail = null;
let currentlyPlayingCard = null;
let currentlyPlayingVideo = null;

function loadPeople(){
  try{
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  }catch(e){
    return [];
  }
}

function savePeople(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
}

function makeId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeHtml(str){
  return String(str || "").replace(/[&<>"']/g, function(m){
    return ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    })[m];
  });
}

function openDB(){
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if(!db.objectStoreNames.contains(STORE_NAME)){
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveVideo(id, file){
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(file, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getVideo(id){
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteVideo(id){
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function createThumbnailFromVideo(file){
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(0.5, video.duration || 0);
    });

    video.addEventListener("seeked", () => {
      try{
        const width = 900;
        const height = 506;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const targetRatio = width / height;
        const videoRatio = vw / vh;

        let sx = 0, sy = 0, sw = vw, sh = vh;

        if(videoRatio > targetRatio){
          sw = vh * targetRatio;
          sx = (vw - sw) / 2;
        }else{
          sh = vw / targetRatio;
          sy = (vh - sh) / 2;
        }

        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

        URL.revokeObjectURL(url);
        resolve(dataUrl);
      }catch(e){
        URL.revokeObjectURL(url);
        reject(e);
      }
    });

    video.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Kunne ikke læse videoen."));
    });
  });
}

videoInput.addEventListener("change", async () => {
  selectedVideoFile = videoInput.files[0] || null;
  selectedThumbnail = null;

  if(selectedVideoFile){
    try{
      selectedThumbnail = await createThumbnailFromVideo(selectedVideoFile);
    }catch(e){
      alert("Kunne ikke lave thumbnail fra videoen. Prøv en anden video.");
    }
  }
});

function sortedPeople(){
  return [...people].sort((a,b) => {
    if(Boolean(a.favorite) !== Boolean(b.favorite)){
      return a.favorite ? -1 : 1;
    }
    return (a.order || 0) - (b.order || 0);
  });
}

function renderPeople(){
  stopCurrentVideo();

  familyGrid.innerHTML = "";

  const shown = sortedPeople();

  if(shown.length === 0){
    familyGrid.innerHTML = `
      <div class="empty">
        <h2>Ingen personer endnu</h2>
        <p>Tryk 5 gange på familie-ikonet øverst til venstre for at oprette personer.</p>
      </div>
    `;
    return;
  }

  shown.forEach(person => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = person.id;

    const imageHtml = person.thumbnail
      ? `<img class="thumb" src="${person.thumbnail}" alt="${escapeHtml(person.name)}">`
      : `<div class="thumb fallbackThumb">${escapeHtml(person.name.charAt(0).toUpperCase())}</div>`;

    card.innerHTML = `
      ${person.favorite ? `<div class="favoriteBadge">⭐</div>` : ""}
      <div class="videoFrame">
        ${imageHtml}
        <video class="inlineVideo" playsinline preload="metadata"></video>
        <div class="playButton">
          <div class="playCircle">▶</div>
        </div>
      </div>
      <div class="info">
        <p class="name">${escapeHtml(person.name)}</p>
        <p class="relation">${escapeHtml(person.relation)}</p>
      </div>
    `;

    card.querySelector(".videoFrame").addEventListener("click", () => playInCard(person.id, card));

    familyGrid.appendChild(card);
  });
}

async function playInCard(id, card){
  const person = people.find(p => p.id === id);
  if(!person) return;

  const video = card.querySelector(".inlineVideo");

  if(currentlyPlayingCard === card){
    if(video.paused){
      video.play().catch(() => {});
    }else{
      video.pause();
    }
    return;
  }

  stopCurrentVideo();

  const file = await getVideo(id);

  if(!file){
    alert("Der er ikke valgt en video til " + person.name + ".");
    return;
  }

  video.src = URL.createObjectURL(file);
  card.classList.add("playing");

  currentlyPlayingCard = card;
  currentlyPlayingVideo = video;

  video.currentTime = 0;
  video.play().catch(() => {});

  video.onended = () => {
    stopCurrentVideo();
  };
}

function stopCurrentVideo(){
  if(currentlyPlayingVideo){
    try{
      currentlyPlayingVideo.pause();
      currentlyPlayingVideo.currentTime = 0;

      if(currentlyPlayingVideo.src){
        URL.revokeObjectURL(currentlyPlayingVideo.src);
        currentlyPlayingVideo.removeAttribute("src");
        currentlyPlayingVideo.load();
      }
    }catch(e){}
  }

  if(currentlyPlayingCard){
    currentlyPlayingCard.classList.remove("playing");
  }

  currentlyPlayingCard = null;
  currentlyPlayingVideo = null;
}

function renderAdminList(){
  adminList.innerHTML = "";

  const shown = sortedPeople();

  if(shown.length === 0){
    adminList.innerHTML = `
      <p style="text-align:center;color:rgba(255,255,255,.72);">
        Ingen personer oprettet endnu.
      </p>
    `;
    return;
  }

  shown.forEach(person => {
    const item = document.createElement("div");
    item.className = "listItem";
    item.dataset.id = person.id;

    item.innerHTML = `
      <div>
        <strong>${person.favorite ? "⭐ " : ""}${escapeHtml(person.name)}</strong><br>
        <span style="color:rgba(255,255,255,.7);font-size:14px;">
          ${escapeHtml(person.relation)}
        </span>
      </div>
      <div class="smallActions">
        <button class="lightBtn upBtn">⬆️</button>
        <button class="lightBtn downBtn">⬇️</button>
        <button class="lightBtn favBtn">${person.favorite ? "Fjern ⭐" : "⭐"}</button>
        <button class="lightBtn editBtn">Ret</button>
        <button class="dangerBtn deleteBtn">Slet</button>
      </div>
    `;

    item.querySelector(".upBtn").addEventListener("click", () => {
      movePerson(person.id, -1);
    });

    item.querySelector(".downBtn").addEventListener("click", () => {
      movePerson(person.id, 1);
    });

    item.querySelector(".favBtn").addEventListener("click", () => {
      person.favorite = !person.favorite;
      savePeople();
      renderPeople();
      renderAdminList();
    });

    item.querySelector(".editBtn").addEventListener("click", () => {
      adminModal.classList.remove("show");
      openEditForm(person.id);
    });

    item.querySelector(".deleteBtn").addEventListener("click", async () => {
      if(confirm("Vil du slette " + person.name + "?")){
        people = people.filter(p => p.id !== person.id);
        savePeople();
        await deleteVideo(person.id);
        renderPeople();
        renderAdminList();
      }
    });

    adminList.appendChild(item);
  });
}

function movePerson(id, direction){
  const list = sortedPeople();
  const index = list.findIndex(p => p.id === id);
  if(index < 0) return;

  const newIndex = index + direction;
  if(newIndex < 0 || newIndex >= list.length) return;

  const [moved] = list.splice(index, 1);
  list.splice(newIndex, 0, moved);

  list.forEach((p, i) => {
    const original = people.find(x => x.id === p.id);
    if(original) original.order = i;
  });

  savePeople();
  renderPeople();
  renderAdminList();
}

function openAdmin(){
  stopCurrentVideo();
  renderAdminList();
  adminModal.classList.add("show");
}

function openNewForm(){
  formTitle.textContent = "Opret familiemedlem";
  editId.value = "";
  nameInput.value = "";
  relationInput.value = "";
  favoriteInput.checked = false;
  videoInput.value = "";
  selectedVideoFile = null;
  selectedThumbnail = null;
  formModal.classList.add("show");
}

function openEditForm(id){
  const person = people.find(p => p.id === id);
  if(!person) return;

  formTitle.textContent = "Rediger familiemedlem";
  editId.value = person.id;
  nameInput.value = person.name;
  relationInput.value = person.relation;
  favoriteInput.checked = !!person.favorite;
  videoInput.value = "";
  selectedVideoFile = null;
  selectedThumbnail = null;
  formModal.classList.add("show");
}

async function saveForm(){
  const name = nameInput.value.trim();
  const relation = relationInput.value.trim();
  const id = editId.value;

  if(!name){
    alert("Skriv et navn.");
    return;
  }

  if(!relation){
    alert("Skriv en titel/relation.");
    return;
  }

  if(id){
    const person = people.find(p => p.id === id);
    if(!person) return;

    person.name = name;
    person.relation = relation;
    person.favorite = favoriteInput.checked;

    if(selectedVideoFile){
      await saveVideo(id, selectedVideoFile);
      person.hasVideo = true;

      if(selectedThumbnail){
        person.thumbnail = selectedThumbnail;
      }
    }
  }else{
    if(!selectedVideoFile){
      alert("Vælg en video.");
      return;
    }

    const newId = makeId();

    const person = {
      id: newId,
      name,
      relation,
      favorite: favoriteInput.checked,
      thumbnail: selectedThumbnail,
      hasVideo: true,
      order: people.length
    };

    people.push(person);
    await saveVideo(newId, selectedVideoFile);
  }

  savePeople();
  renderPeople();
  renderAdminList();
  formModal.classList.remove("show");
}

hiddenAdminLogo.addEventListener("click", () => {
  tapCount++;

  if(tapTimer){
    clearTimeout(tapTimer);
  }

  tapTimer = setTimeout(() => {
    tapCount = 0;
  }, 1200);

  if(tapCount >= 5){
    tapCount = 0;
    clearTimeout(tapTimer);
    openAdmin();
  }
});

closeAdminBtn.addEventListener("click", () => {
  adminModal.classList.remove("show");
});

newPersonBtn.addEventListener("click", () => {
  adminModal.classList.remove("show");
  openNewForm();
});

saveBtn.addEventListener("click", saveForm);

cancelFormBtn.addEventListener("click", () => {
  formModal.classList.remove("show");
});

if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

renderPeople();
