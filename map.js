// Инициализация карты
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomControl: true
});

// Размеры карты
const mapWidth = 6200;
const mapHeight = 6200;
const bounds = [[0, 0], [mapHeight, mapWidth]];

// Добавляем тайлы
L.tileLayer('tiles/{z}/{x}/{y}.png', {
    bounds: bounds,
    maxZoom: 2,
    minZoom: -2,
    noWrap: true
}).addTo(map);

// Центрируем карту
map.fitBounds(bounds);

// Массив для хранения меток
let markers = [];

// Загружаем сохраненные метки из localStorage
loadMarkers();

// Обработчик клика для создания метки
map.on('click', function(e) {
    const marker = L.marker(e.latlng).addTo(map);

    // Добавляем popup с полями
    marker.bindPopup(`
        <input type="text" id="markerName" placeholder="Название" style="width: 200px;"><br>
        <textarea id="markerNote" placeholder="Заметка" style="width: 200px; height: 60px;"></textarea><br>
        <button onclick="saveMarker(${markers.length})">Сохранить</button>
        <button onclick="deleteMarker(${markers.length})">Удалить</button>
    `);

    markers.push({
        marker: marker,
        name: '',
        note: '',
        lat: e.latlng.lat,
        lng: e.latlng.lng
    });
});

// Сохранение данных метки
function saveMarker(index) {
    const name = document.getElementById('markerName').value;
    const note = document.getElementById('markerNote').value;

    markers[index].name = name;
    markers[index].note = note;

    // Обновляем popup
    markers[index].marker.setPopupContent(`<b>${name}</b><br>${note}`);

    // Сохраняем в localStorage
    saveToLocalStorage();
}

// Удаление метки
function deleteMarker(index) {
    map.removeLayer(markers[index].marker);
    markers.splice(index, 1);
    saveToLocalStorage();
}

// Сохранение в localStorage
function saveToLocalStorage() {
    const data = markers.map(m => ({
        name: m.name,
        note: m.note,
        lat: m.lat,
        lng: m.lng
    }));
    localStorage.setItem('markers', JSON.stringify(data));
}

// Загрузка из localStorage
function loadMarkers() {
    const data = localStorage.getItem('markers');
    if (data) {
        const parsed = JSON.parse(data);
        parsed.forEach(m => {
            const marker = L.marker([m.lat, m.lng]).addTo(map);
            marker.bindPopup(`<b>${m.name}</b><br>${m.note}`);
            markers.push({
                marker: marker,
                name: m.name,
                note: m.note,
                lat: m.lat,
                lng: m.lng
            });
        });
    }
}

// Экспорт меток в JSON
function exportMarkers() {
    const data = markers.map(m => ({
        name: m.name,
        note: m.note,
        lat: m.lat,
        lng: m.lng
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'markers.json';
    a.click();
}

// Импорт меток из JSON
function importMarkers(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = JSON.parse(e.target.result);
            // Очищаем текущие метки
            markers.forEach(m => map.removeLayer(m.marker));
            markers = [];

            // Загружаем новые
            data.forEach(m => {
                const marker = L.marker([m.lat, m.lng]).addTo(map);
                marker.bindPopup(`<b>${m.name}</b><br>${m.note}`);
                markers.push({
                    marker: marker,
                    name: m.name,
                    note: m.note,
                    lat: m.lat,
                    lng: m.lng
                });
            });
            saveToLocalStorage();
        };
        reader.readAsText(file);
    }
}

// Очистка всех меток
function clearMarkers() {
    if (confirm('Удалить все метки?')) {
        markers.forEach(m => map.removeLayer(m.marker));
        markers = [];
        localStorage.removeItem('markers');
    }
}