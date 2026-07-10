// === КОНФИГУРАЦИЯ КАРТЫ ===
const MAP_WIDTH = 6200;
const MAP_HEIGHT = 6200;

// Исправленный CRS.Simple: сдвигает начало координат, чтобы индексы тайлов были >= 0
const crs = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(1, 0, -1, MAP_HEIGHT),
    scale: function(zoom) { return Math.pow(2, zoom); },
    zoom: function(scale) { return Math.log(scale) / Math.LN2; }
});

const map = L.map('map', {
    crs: crs,
    minZoom: -2,
    maxZoom: 2,
    zoomControl: true
});

const bounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];

L.tileLayer('tiles/{z}/{x}/{y}.png', {
    bounds: bounds,
    maxZoom: 2,
    minZoom: -2,
    noWrap: true
}).addTo(map);

map.fitBounds(bounds);

// === ХРАНЕНИЕ ДАННЫХ ===
let markers = [];
let pings = []; // Активные пинги: {id, lat, lng, timestamp, type}

// Загрузка при старте
loadMarkers();
loadPings();

// === МЕТКИ ===
map.on('click', function(e) {
    // Правый клик или Ctrl+клик — пинг, обычный клик — метка
    if (e.originalEvent.ctrlKey || e.originalEvent.button === 2) {
        const type = document.getElementById('pingType').value;
        addPing(e.latlng, type);
        return;
    }

    const marker = L.marker(e.latlng).addTo(map);
    const idx = markers.length;

    marker.bindPopup(`
        <input type="text" id="markerName" placeholder="Название" style="width:200px;"><br>
        <textarea id="markerNote" placeholder="Заметка" style="width:200px;height:60px;"></textarea><br>
        <button onclick="saveMarker(${idx})">Сохранить</button>
        <button onclick="deleteMarker(${idx})">Удалить</button>
    `);

    markers.push({ marker, name: '', note: '', lat: e.latlng.lat, lng: e.latlng.lng });
});

// Предотвращаем контекстное меню для правого клика (пинг)
map.getContainer().addEventListener('contextmenu', e => e.preventDefault());

function saveMarker(index) {
    const name = document.getElementById('markerName').value;
    const note = document.getElementById('markerNote').value;
    markers[index].name = name;
    markers[index].note = note;
    markers[index].marker.setPopupContent(`<b>${name}</b><br>${note}`);
    saveToLocalStorage();
}

function deleteMarker(index) {
    map.removeLayer(markers[index].marker);
    markers.splice(index, 1);
    saveToLocalStorage();
}

// === ПИНГИ ===
// Типы пингов: loot_cleared (лут собран), respawn_wait (ждать респавн), danger (опасно)
const PING_TYPES = {
    loot_cleared: { color: '#22c55e', label: 'Лут собран' },
    respawn_wait: { color: '#f59e0b', label: 'Ждать респавн' },
    danger:       { color: '#ef4444', label: 'Опасно!' }
};

function addPing(latlng, type = 'loot_cleared') {
    const ping = {
        id: Date.now() + Math.random(),
        lat: latlng.lat,
        lng: latlng.lng,
        timestamp: Date.now(),
        type: type
    };

    pings.push(ping);
    renderPing(ping);
    savePings();

    // Автоудаление пинга через 60 секунд
    setTimeout(() => removePing(ping.id), 60000);
}

function renderPing(ping) {
    const cfg = PING_TYPES[ping.type] || PING_TYPES.loot_cleared;

    // Круговой маркер-пинг
    const circle = L.circleMarker([ping.lat, ping.lng], {
        radius: 12,
        fillColor: cfg.color,
        color: '#fff',
        weight: 2,
        fillOpacity: 0.8,
        className: 'ping-marker'
    }).addTo(map);

    circle.bindTooltip(cfg.label, { permanent: false, direction: 'top' });

    // Анимация затухания через CSS (добавляется в styles.css)
    const el = circle.getElement();
    if (el) el.classList.add('ping-animate');

    // Сохраняем ссылку для удаления
    ping._layer = circle;
}

function removePing(id) {
    const idx = pings.findIndex(p => p.id === id);
    if (idx !== -1) {
        if (pings[idx]._layer) map.removeLayer(pings[idx]._layer);
        pings.splice(idx, 1);
        savePings();
    }
}

// === СОХРАНЕНИЕ / ЗАГРУЗКА ===
function saveToLocalStorage() {
    const data = markers.map(m => ({ name: m.name, note: m.note, lat: m.lat, lng: m.lng }));
    localStorage.setItem('markers', JSON.stringify(data));
}

function loadMarkers() {
    const data = localStorage.getItem('markers');
    if (!data) return;
    JSON.parse(data).forEach(m => {
        const marker = L.marker([m.lat, m.lng]).addTo(map);
        marker.bindPopup(`<b>${m.name}</b><br>${m.note}`);
        markers.push({ marker, name: m.name, note: m.note, lat: m.lat, lng: m.lng });
    });
}

function savePings() {
    // Сохраняем только активные пинги (без _layer)
    const data = pings.map(p => ({ id: p.id, lat: p.lat, lng: p.lng, timestamp: p.timestamp, type: p.type }));
    localStorage.setItem('pings', JSON.stringify(data));
}

function loadPings() {
    const data = localStorage.getItem('pings');
    if (!data) return;
    const now = Date.now();
    JSON.parse(data).forEach(p => {
        // Пропускаем просроченные пинги (>60 сек)
        if (now - p.timestamp > 60000) return;
        pings.push(p);
        renderPing(p);
        setTimeout(() => removePing(p.id), 60000 - (now - p.timestamp));
    });
}

// === ЭКСПОРТ / ИМПОРТ МЕТОК ===
function exportMarkers() {
    const data = markers.map(m => ({ name: m.name, note: m.note, lat: m.lat, lng: m.lng }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'markers.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importMarkers(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = JSON.parse(e.target.result);
        markers.forEach(m => map.removeLayer(m.marker));
        markers = [];
        data.forEach(m => {
            const marker = L.marker([m.lat, m.lng]).addTo(map);
            marker.bindPopup(`<b>${m.name}</b><br>${m.note}`);
            markers.push({ marker, name: m.name, note: m.note, lat: m.lat, lng: m.lng });
        });
        saveToLocalStorage();
    };
    reader.readAsText(file);
}

function clearMarkers() {
    if (!confirm('Удалить все метки?')) return;
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];
    localStorage.removeItem('markers');
}