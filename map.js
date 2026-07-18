// === ТЕМА ===
function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebarToggle');

    sidebar.classList.toggle('collapsed');
    btn.classList.toggle('collapsed');
    btn.innerHTML = sidebar.classList.contains('collapsed') ? '&gt;' : '&lt;';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = theme === 'dark' ? 'Темная' : 'Светлая';
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

initTheme();

// === АВТОРИЗАЦИЯ ===
function checkAuth() {
    const input = document.getElementById('authPassword');
    const error = document.getElementById('authError');
    if (input.value === SITE_PASSWORD) {
        localStorage.setItem('map_auth', 'true');
        document.getElementById('authOverlay').classList.add('hidden');
        error.style.display = 'none';
    } else {
        error.style.display = 'block';
        input.value = '';
    }
}

function logout() {
    localStorage.removeItem('map_auth');
    document.getElementById('authOverlay').classList.remove('hidden');
    document.getElementById('authPassword').value = '';
}

if (localStorage.getItem('map_auth') === 'true') {
    document.getElementById('authOverlay').classList.add('hidden');
}

document.getElementById('authPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAuth();
});

// === КОНФИГУРАЦИЯ КАРТЫ ===
const MAP_WIDTH = 6200;
const MAP_HEIGHT = 4650;

const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 2,
    zoomControl: true,
    maxBounds: [[0, 0], [MAP_HEIGHT, MAP_WIDTH]],
    maxBoundsViscosity: 1.0
});

const bounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];
L.imageOverlay('map.webp', bounds).addTo(map);
map.setView([MAP_HEIGHT / 2, MAP_WIDTH / 2], 0);

// === КАСТОМНАЯ ИКОНКА МЕТКИ ===
// iconAnchor: [16, 32] — точка "ножки" пиньяты.
// Если картинка другого размера, подгони значения (ширина/2, высота)
const customIcon = L.icon({
    iconUrl: 'pinata.png',
    iconSize: [32, 32],      // Размер отображения
    iconAnchor: [16, 32],    // Точка привязки к координатам (низ по центру)
    popupAnchor: [0, -32]    // Откуда открывается попап (над верхушкой иконки)
});

// === ХРАНЕНИЕ ДАННЫХ ===
let markers = {};
let pings = {};
let currentEditId = null;
const PING_DURATION = 900000; // 15 минут

setupFirebaseListeners();
updateMarkerList();

// === СЖАТИЕ КАРТИНОК ===
function fileToCompressedDataURL(file, maxWidth = 600, quality = 0.6) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// === МЕТКИ ===
map.on('click', async function(e) {
    if (localStorage.getItem('map_auth') !== 'true') {
        alert('Войдите на сайт, чтобы взаимодействовать с картой');
        return;
    }
    if (e.originalEvent.ctrlKey || e.originalEvent.button === 2) {
        addPing(e.latlng);
        return;
    }

    // Применяем кастомную иконку
    const marker = L.marker(e.latlng, { icon: customIcon }).addTo(map);
    const tempId = 'temp_' + Date.now();

    marker.bindPopup(`
        <input type="text" id="markerName" placeholder="Название" style="width:200px;"><br>
        <textarea id="markerNote" placeholder="Заметка" style="width:200px;height:60px;"></textarea><br>
        <input type="file" id="markerImage" accept="image/*" style="width:200px;margin:5px 0;"><br>
        <button onclick="saveMarker('${tempId}')">Сохранить</button>
        <button onclick="deleteMarker('${tempId}')">Отмена</button>
    `);

    markers[tempId] = { marker, name: '', note: '', lat: e.latlng.lat, lng: e.latlng.lng };
    updateMarkerList();
});

map.getContainer().addEventListener('contextmenu', e => e.preventDefault());

async function saveMarker(tempId) {
    const name = document.getElementById('markerName').value;
    const note = document.getElementById('markerNote').value;
    const fileInput = document.getElementById('markerImage');
    const data = markers[tempId];
    if (!data) return;

    let imageUrl = null;
    if (fileInput.files && fileInput.files[0]) {
        try {
            imageUrl = await fileToCompressedDataURL(fileInput.files[0]);
        } catch (err) {
            alert('Не удалось обработать изображение');
            return;
        }
    }

    db.ref('markers').push({ name, note, lat: data.lat, lng: data.lng, imageUrl });
    map.removeLayer(data.marker);
    delete markers[tempId];
    updateMarkerList();
    saveCache();
}

function deleteMarker(id) {
    if (typeof id === 'string' && id.startsWith('temp_')) {
        if (markers[id]) {
            map.removeLayer(markers[id].marker);
            delete markers[id];
        }
        updateMarkerList();
        saveCache();
        return;
    }
    if (localStorage.getItem('map_auth') !== 'true') {
        alert('Необходимо войти на сайт');
        return;
    }
    const answer = prompt('Введите пароль для удаления метки:');
    if (answer !== SITE_PASSWORD) {
        if (answer !== null) alert('Неверный пароль');
        return;
    }
    if (markers[id]) {
        map.removeLayer(markers[id].marker);
        delete markers[id];
    }
    db.ref('markers/' + id).remove();
}

// === РЕДАКТИРОВАНИЕ ===
function editMarker(id) {
    if (localStorage.getItem('map_auth') !== 'true') {
        alert('Необходимо войти на сайт');
        return;
    }
    const m = markers[id];
    if (!m) return;
    currentEditId = id;
    document.getElementById('editName').value = m.name || '';
    document.getElementById('editNote').value = m.note || '';
    document.getElementById('editImage').value = '';
    document.getElementById('editModal').classList.remove('hidden');
}

async function saveEditMarker() {
    if (!currentEditId) return;
    const name = document.getElementById('editName').value;
    const note = document.getElementById('editNote').value;
    const fileInput = document.getElementById('editImage');
    const updateData = { name, note };

    if (fileInput.files && fileInput.files[0]) {
        try {
            updateData.imageUrl = await fileToCompressedDataURL(fileInput.files[0]);
        } catch (err) {
            alert('Ошибка обработки изображения');
            return;
        }
    }

    await db.ref('markers/' + currentEditId).update(updateData);
    closeEditModal();
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    currentEditId = null;
}

function flyToMarker(id) {
    if (markers[id]) {
        map.setView([markers[id].lat, markers[id].lng], 1);
        markers[id].marker.openPopup();
    }
}

// === СПИСОК МЕТОК ===
function updateMarkerList() {
    const list = document.getElementById('markerList');
    if (!list) return;
    list.innerHTML = '';

    // Фильтруем временные метки и сортируем по имени (алфавит, поддержка кириллицы)
    const entries = Object.entries(markers)
        .filter(([id]) => !id.startsWith('temp_'))
        .sort(([, a], [, b]) => {
            const nameA = (a.name || 'Без названия').toLowerCase();
            const nameB = (b.name || 'Без названия').toLowerCase();
            return nameA.localeCompare(nameB, 'ru');
        });

    if (entries.length === 0) {
        list.innerHTML = '<div class="list-empty">Нет сохранённых меток</div>';
        return;
    }

    entries.forEach(([id, data]) => {
        const item = document.createElement('div');
        item.className = 'marker-item';
        item.innerHTML = `
            <span class="marker-name" onclick="flyToMarker('${id}')">${data.name || 'Без названия'}</span>
            <button class="marker-edit" onclick="editMarker('${id}')" title="Редактировать">✎</button>
            <button class="marker-delete" onclick="deleteMarker('${id}')" title="Удалить">×</button>
        `;
        list.appendChild(item);
    });
}

// === КЭШИРОВАНИЕ ===
function saveCache() {
    const cache = {};
    Object.entries(markers).forEach(([id, m]) => {
        if (!id.startsWith('temp_')) {
            cache[id] = { name: m.name, note: m.note, lat: m.lat, lng: m.lng, imageUrl: m.imageUrl };
        }
    });
    localStorage.setItem('markers_cache', JSON.stringify(cache));
}

// === ПИНГИ ===
function addPing(latlng) {
    db.ref('pings').push({ lat: latlng.lat, lng: latlng.lng, timestamp: Date.now() });
}

function renderPing(id, data) {
    if (pings[id]) return;
    const age = Date.now() - data.timestamp;
    if (age > PING_DURATION) {
        db.ref('pings/' + id).remove();
        return;
    }
    const circle = L.circleMarker([data.lat, data.lng], {
        radius: 14, fillColor: '#9ca3af', color: '#fff', weight: 2, fillOpacity: 0.9
    }).addTo(map);
    circle.bindTooltip('Лут собран', { permanent: false, direction: 'top' });
    const timeoutId = setTimeout(() => {
        if (pings[id]) {
            map.removeLayer(pings[id]._layer);
            delete pings[id];
        }
        db.ref('pings/' + id).remove();
    }, PING_DURATION - age);
    pings[id] = { _layer: circle, timeoutId };
}

// === FIREBASE LISTENERS ===
function setupFirebaseListeners() {
    const cachedMarkers = localStorage.getItem('markers_cache');
    if (cachedMarkers) {
        const cached = JSON.parse(cachedMarkers);
        Object.entries(cached).forEach(([id, m]) => {
            if (!markers[id]) {
                // Применяем кастомную иконку при загрузке из кэша
                const marker = L.marker([m.lat, m.lng], { icon: customIcon }).addTo(map);
                const imgTag = m.imageUrl ? `<img src="${m.imageUrl}" style="max-width:200px;max-height:150px;display:block;margin-bottom:5px;border-radius:4px;" loading="lazy">` : '';
                marker.bindPopup(`${imgTag}<b>${m.name || 'Без названия'}</b><br>${m.note || ''}`);
                markers[id] = { marker, name: m.name, note: m.note, lat: m.lat, lng: m.lng, imageUrl: m.imageUrl };
            }
        });
        updateMarkerList();
    }

    db.ref('markers').on('child_added', (snapshot) => {
        const id = snapshot.key;
        const m = snapshot.val();
        if (!markers[id]) {
            // Применяем кастомную иконку при загрузке из Firebase
            const marker = L.marker([m.lat, m.lng], { icon: customIcon }).addTo(map);
            const imgTag = m.imageUrl ? `<img src="${m.imageUrl}" style="max-width:200px;max-height:150px;display:block;margin-bottom:5px;border-radius:4px;" loading="lazy">` : '';
            marker.bindPopup(`${imgTag}<b>${m.name || 'Без названия'}</b><br>${m.note || ''}`);
            markers[id] = { marker, name: m.name, note: m.note, lat: m.lat, lng: m.lng, imageUrl: m.imageUrl };
            updateMarkerList();
            saveCache();
        }
    });

    db.ref('markers').on('child_changed', (snapshot) => {
        const id = snapshot.key;
        const m = snapshot.val();
        if (markers[id]) {
            markers[id].name = m.name;
            markers[id].note = m.note;
            markers[id].imageUrl = m.imageUrl;
            const imgTag = m.imageUrl ? `<img src="${m.imageUrl}" style="max-width:200px;max-height:150px;display:block;margin-bottom:5px;border-radius:4px;" loading="lazy">` : '';
            markers[id].marker.setPopupContent(`${imgTag}<b>${m.name || 'Без названия'}</b><br>${m.note || ''}`);
            updateMarkerList();
            saveCache();
        }
    });

    db.ref('markers').on('child_removed', (snapshot) => {
        const id = snapshot.key;
        if (markers[id]) {
            map.removeLayer(markers[id].marker);
            delete markers[id];
            updateMarkerList();
            saveCache();
        }
    });

    db.ref('pings').on('child_added', (snapshot) => renderPing(snapshot.key, snapshot.val()));
    db.ref('pings').on('child_removed', (snapshot) => {
        const id = snapshot.key;
        if (pings[id]) {
            map.removeLayer(pings[id]._layer);
            clearTimeout(pings[id].timeoutId);
            delete pings[id];
        }
    });
}

// === ЭКСПОРТ / ИМПОРТ ===
async function exportMarkers() {
    const snapshot = await db.ref('markers').once('value');
    const data = snapshot.val() || {};
    const arr = Object.entries(data).map(([id, m]) => ({ id, ...m }));
    const blob = new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'markers.json';
    a.click();
    URL.revokeObjectURL(url);
}

async function importMarkers(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (localStorage.getItem('map_auth') !== 'true') {
        alert('Необходимо войти на сайт');
        return;
    }
    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = JSON.parse(e.target.result);
        await db.ref('markers').remove();
        localStorage.removeItem('markers_cache');
        const updates = {};
        data.forEach(m => {
            const newRef = db.ref('markers').push();
            updates['/markers/' + newRef.key] = {
                name: m.name,
                note: m.note,
                lat: m.lat,
                lng: m.lng,
                imageUrl: m.imageUrl || null
            };
        });
        await db.ref().update(updates);
    };
    reader.readAsText(file);
}

async function clearMarkers() {
    if (localStorage.getItem('map_auth') !== 'true') {
        alert('Необходимо войти на сайт');
        return;
    }
    const answer = prompt('Внимание! Это удалит ВСЕ метки.\nВведите пароль администратора:');
    if (answer !== SITE_PASSWORD) {
        if (answer !== null) alert('Неверный пароль');
        return;
    }
    await db.ref('markers').remove();
}