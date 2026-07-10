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

// Загружаем ОДНУ картинку вместо тайлов
// Если оставил PNG, замени 'map.webp' на 'map.png'
L.imageOverlay('map.webp', bounds).addTo(map);

map.setView([MAP_HEIGHT / 2, MAP_WIDTH / 2], 0);

// === ХРАНЕНИЕ ДАННЫХ ===
let markers = [];
let pings = [];

loadMarkers();
loadPings();

// === МЕТКИ ===
map.on('click', function(e) {
    if (e.originalEvent.ctrlKey || e.originalEvent.button === 2) {
        addPing(e.latlng);
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
const PING_DURATION = 300000; // 5 минут в миллисекундах
const PING_COLOR = '#9ca3af'; // Серый цвет

function addPing(latlng) {
    const ping = {
        id: Date.now() + Math.random(),
        lat: latlng.lat,
        lng: latlng.lng,
        timestamp: Date.now()
    };

    pings.push(ping);
    renderPing(ping);
    savePings();

    setTimeout(() => removePing(ping.id), PING_DURATION);
}

function renderPing(ping) {
    const circle = L.circleMarker([ping.lat, ping.lng], {
        radius: 14,
        fillColor: PING_COLOR,
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9
    }).addTo(map);

    circle.bindTooltip('Лут собран', { permanent: false, direction: 'top' });
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

function savePings() {
    const data = pings.map(p => ({ id: p.id, lat: p.lat, lng: p.lng, timestamp: p.timestamp }));
    localStorage.setItem('pings', JSON.stringify(data));
}

function loadPings() {
    const data = localStorage.getItem('pings');
    if (!data) return;
    const now = Date.now();
    JSON.parse(data).forEach(p => {
        if (now - p.timestamp > PING_DURATION) return;
        pings.push(p);
        renderPing(p);
        setTimeout(() => removePing(p.id), PING_DURATION - (now - p.timestamp));
    });
}

// === ЭКСПОРТ / ИМПОРТ ===
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