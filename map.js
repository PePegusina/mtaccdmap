// === КОНФИГУРАЦИЯ КАРТЫ ===
const MAP_WIDTH = 6200;
const MAP_HEIGHT = 6200;

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

// === ХРАНЕНИЕ ДАННЫХ ===
let markers = {};
let pings = {};
const PING_DURATION = 300000; // 5 минут

// === ИНИЦИАЛИЗАЦИЯ ===
setupFirebaseListeners();

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
// Сжатие изображения перед загрузкой, чтобы экономить место в Storage
function compressImage(file, maxWidth = 800, quality = 0.7) {
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
                canvas.toBlob(resolve, 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// === МЕТКИ ===
map.on('click', async function(e) {
    if (e.originalEvent.ctrlKey || e.originalEvent.button === 2) {
        addPing(e.latlng);
        return;
    }

    const marker = L.marker(e.latlng).addTo(map);
    const tempId = 'temp_' + Date.now();

    // Добавлено поле для выбора файла (скриншота)
    marker.bindPopup(`
        <input type="text" id="markerName" placeholder="Название" style="width:200px;"><br>
        <textarea id="markerNote" placeholder="Заметка" style="width:200px;height:60px;"></textarea><br>
        <input type="file" id="markerImage" accept="image/*" style="width:200px;margin:5px 0;"><br>
        <button onclick="saveMarker('${tempId}')">Сохранить</button>
        <button onclick="deleteMarker('${tempId}')">Удалить</button>
    `);

    markers[tempId] = { marker, name: '', note: '', lat: e.latlng.lat, lng: e.latlng.lng };
});

map.getContainer().addEventListener('contextmenu', e => e.preventDefault());

async function saveMarker(tempId) {
    const name = document.getElementById('markerName').value;
    const note = document.getElementById('markerNote').value;
    const fileInput = document.getElementById('markerImage');

    const data = markers[tempId];
    let imageUrl = null;

    // Если выбран файл, сжимаем и загружаем в Firebase Storage
    if (fileInput.files && fileInput.files[0]) {
        try {
            const compressedBlob = await compressImage(fileInput.files[0]);
            const imageRef = firebase.storage().ref().child(`markers/${tempId}_${Date.now()}.jpg`);
            await imageRef.put(compressedBlob);
            imageUrl = await imageRef.getDownloadURL();
        } catch (err) {
            console.error('Ошибка загрузки картинки:', err);
            alert('Не удалось загрузить изображение');
            return;
        }
    }

    db.ref('markers').push({
        name: name,
        note: note,
        lat: data.lat,
        lng: data.lng,
        imageUrl: imageUrl
    });

    map.removeLayer(data.marker);
    delete markers[tempId];
}

function deleteMarker(id) {
    if (markers[id]) {
        map.removeLayer(markers[id].marker);
        delete markers[id];
    }
    db.ref('markers/' + id).remove();
}

// === ПИНГИ ===
function addPing(latlng) {
    db.ref('pings').push({
        lat: latlng.lat,
        lng: latlng.lng,
        timestamp: Date.now()
    });
}

function renderPing(id, data) {
    if (pings[id]) return;

    const age = Date.now() - data.timestamp;
    if (age > PING_DURATION) {
        db.ref('pings/' + id).remove();
        return;
    }

    const circle = L.circleMarker([data.lat, data.lng], {
        radius: 14,
        fillColor: '#9ca3af',
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9
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
    db.ref('markers').on('child_added', (snapshot) => {
        const id = snapshot.key;
        const m = snapshot.val();
        if (!markers[id]) {
            const marker = L.marker([m.lat, m.lng]).addTo(map);
            // Отображаем картинку в попапе, если она есть
            const imgTag = m.imageUrl ? `<img src="${m.imageUrl}" style="max-width:200px;max-height:150px;display:block;margin-bottom:5px;border-radius:4px;">` : '';
            marker.bindPopup(`${imgTag}<b>${m.name || 'Без названия'}</b><br>${m.note || ''}`);
            markers[id] = { marker, name: m.name, note: m.note, lat: m.lat, lng: m.lng, imageUrl: m.imageUrl };
        }
    });

    db.ref('markers').on('child_changed', (snapshot) => {
        const id = snapshot.key;
        const m = snapshot.val();
        if (markers[id]) {
            markers[id].name = m.name;
            markers[id].note = m.note;
            const imgTag = m.imageUrl ? `<img src="${m.imageUrl}" style="max-width:200px;max-height:150px;display:block;margin-bottom:5px;border-radius:4px;">` : '';
            markers[id].marker.setPopupContent(`${imgTag}<b>${m.name || 'Без названия'}</b><br>${m.note || ''}`);
        }
    });

    db.ref('markers').on('child_removed', (snapshot) => {
        const id = snapshot.key;
        if (markers[id]) {
            map.removeLayer(markers[id].marker);
            delete markers[id];
        }
    });

    db.ref('pings').on('child_added', (snapshot) => {
        renderPing(snapshot.key, snapshot.val());
    });

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

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = JSON.parse(e.target.result);
        await db.ref('markers').remove();

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

// === ЗАЩИЩЕННАЯ ОЧИСТКА ===
async function clearMarkers() {
    // Требуем ввода кодового слова для предотвращения случайного клика
    const answer = prompt('Внимание! Это действие удалит ВСЕ метки безвозвратно.\nДля подтверждения введите слово: УДАЛИТЬ');
    if (answer !== 'УДАЛИТЬ') {
        if (answer !== null) alert('Неверное слово. Удаление отменено.');
        return;
    }
    await db.ref('markers').remove();
}