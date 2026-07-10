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
let markers = []; // {id, marker, name, note, lat, lng}
let pings = [];   // {id, lat, lng, _layer, timeoutId}

const PING_DURATION = 300000; // 5 минут

// === ИНИЦИАЛИЗАЦИЯ ===
async function init() {
    await loadMarkers();
    await loadPings();
    setupRealtimeSubscriptions();
}

init();

// === МЕТКИ ===
map.on('click', async function(e) {
    if (e.originalEvent.ctrlKey || e.originalEvent.button === 2) {
        await addPing(e.latlng);
        return;
    }

    const marker = L.marker(e.latlng).addTo(map);
    const tempId = Date.now();

    marker.bindPopup(`
        <input type="text" id="markerName" placeholder="Название" style="width:200px;"><br>
        <textarea id="markerNote" placeholder="Заметка" style="width:200px;height:60px;"></textarea><br>
        <button onclick="saveMarker('${tempId}')">Сохранить</button>
        <button onclick="deleteMarker('${tempId}')">Удалить</button>
    `);

    markers.push({ id: tempId, marker, name: '', note: '', lat: e.latlng.lat, lng: e.latlng.lng });
});

map.getContainer().addEventListener('contextmenu', e => e.preventDefault());

async function saveMarker(tempId) {
    const idx = markers.findIndex(m => m.id == tempId);
    if (idx === -1) return;

    const name = document.getElementById('markerName').value;
    const note = document.getElementById('markerNote').value;

    // Сохраняем в Supabase
    const { data, error } = await supabase
        .from('markers')
        .insert([{
            name: name,
            note: note,
            lat: markers[idx].lat,
            lng: markers[idx].lng
        }])
        .select()
        .single();

    if (error) {
        console.error('Error saving marker:', error);
        return;
    }

    // Обновляем локальный массив с реальным ID
    markers[idx].id = data.id;
    markers[idx].name = name;
    markers[idx].note = note;
    markers[idx].marker.setPopupContent(`<b>${name}</b><br>${note}`);
}

async function deleteMarker(id) {
    const idx = markers.findIndex(m => m.id == id);
    if (idx === -1) return;

    // Удаляем из Supabase (только если это реальный UUID, а не tempId)
    if (typeof id === 'string' && id.length === 36) {
        await supabase.from('markers').delete().eq('id', id);
    }

    map.removeLayer(markers[idx].marker);
    markers.splice(idx, 1);
}

// === ПИНГИ ===
async function addPing(latlng) {
    const { data, error } = await supabase
        .from('pings')
        .insert([{ lat: latlng.lat, lng: latlng.lng }])
        .select()
        .single();

    if (error) {
        console.error('Error adding ping:', error);
        return;
    }

    // Пинг отрендерится через Realtime подписку
}

function renderPing(pingData) {
    // Проверяем, не добавлен ли уже этот пинг
    if (pings.some(p => p.id === pingData.id)) return;

    const circle = L.circleMarker([pingData.lat, pingData.lng], {
        radius: 14,
        fillColor: '#9ca3af',
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9
    }).addTo(map);

    circle.bindTooltip('Лут собран', { permanent: false, direction: 'top' });

    const timeoutId = setTimeout(() => removePing(pingData.id), PING_DURATION);

    pings.push({
        id: pingData.id,
        lat: pingData.lat,
        lng: pingData.lng,
        _layer: circle,
        timeoutId: timeoutId
    });
}

async function removePing(id) {
    const idx = pings.findIndex(p => p.id === id);
    if (idx === -1) return;

    if (pings[idx]._layer) map.removeLayer(pings[idx]._layer);
    if (pings[idx].timeoutId) clearTimeout(pings[idx].timeoutId);

    pings.splice(idx, 1);

    // Удаляем из базы
    await supabase.from('pings').delete().eq('id', id);
}

// === ЗАГРУЗКА ИЗ SUPABASE ===
async function loadMarkers() {
    const { data, error } = await supabase.from('markers').select('*');
    if (error) {
        console.error('Error loading markers:', error);
        return;
    }

    data.forEach(m => {
        const marker = L.marker([m.lat, m.lng]).addTo(map);
        marker.bindPopup(`<b>${m.name}</b><br>${m.note}`);
        markers.push({
            id: m.id,
            marker: marker,
            name: m.name,
            note: m.note,
            lat: m.lat,
            lng: m.lng
        });
    });
}

async function loadPings() {
    const { data, error } = await supabase.from('pings').select('*');
    if (error) {
        console.error('Error loading pings:', error);
        return;
    }

    const now = Date.now();
    data.forEach(p => {
        const age = now - new Date(p.created_at).getTime();
        if (age > PING_DURATION) {
            // Удаляем старые пинги
            supabase.from('pings').delete().eq('id', p.id);
            return;
        }

        const remainingTime = PING_DURATION - age;
        const circle = L.circleMarker([p.lat, p.lng], {
            radius: 14,
            fillColor: '#9ca3af',
            color: '#fff',
            weight: 2,
            fillOpacity: 0.9
        }).addTo(map);

        circle.bindTooltip('Лут собран', { permanent: false, direction: 'top' });

        const timeoutId = setTimeout(() => removePing(p.id), remainingTime);

        pings.push({
            id: p.id,
            lat: p.lat,
            lng: p.lng,
            _layer: circle,
            timeoutId: timeoutId
        });
    });
}

// === REALTIME ПОДПИСКИ ===
function setupRealtimeSubscriptions() {
    // Подписка на метки
    supabase
        .channel('markers-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'markers' }, (payload) => {
            if (payload.eventType === 'INSERT') {
                const m = payload.new;
                if (!markers.some(mark => mark.id === m.id)) {
                    const marker = L.marker([m.lat, m.lng]).addTo(map);
                    marker.bindPopup(`<b>${m.name}</b><br>${m.note}`);
                    markers.push({
                        id: m.id,
                        marker: marker,
                        name: m.name,
                        note: m.note,
                        lat: m.lat,
                        lng: m.lng
                    });
                }
            } else if (payload.eventType === 'DELETE') {
                const idx = markers.findIndex(mark => mark.id === payload.old.id);
                if (idx !== -1) {
                    map.removeLayer(markers[idx].marker);
                    markers.splice(idx, 1);
                }
            } else if (payload.eventType === 'UPDATE') {
                const idx = markers.findIndex(mark => mark.id === payload.new.id);
                if (idx !== -1) {
                    markers[idx].name = payload.new.name;
                    markers[idx].note = payload.new.note;
                    markers[idx].marker.setPopupContent(`<b>${payload.new.name}</b><br>${payload.new.note}`);
                }
            }
        })
        .subscribe();

    // Подписка на пинги
    supabase
        .channel('pings-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pings' }, (payload) => {
            renderPing(payload.new);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pings' }, (payload) => {
            const idx = pings.findIndex(p => p.id === payload.old.id);
            if (idx !== -1) {
                if (pings[idx]._layer) map.removeLayer(pings[idx]._layer);
                if (pings[idx].timeoutId) clearTimeout(pings[idx].timeoutId);
                pings.splice(idx, 1);
            }
        })
        .subscribe();
}

// === ЭКСПОРТ / ИМПОРТ ===
async function exportMarkers() {
    const { data, error } = await supabase.from('markers').select('*');
    if (error) {
        console.error('Error exporting markers:', error);
        return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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

        // Очищаем текущие метки
        for (const m of markers) {
            await supabase.from('markers').delete().eq('id', m.id);
            map.removeLayer(m.marker);
        }
        markers = [];

        // Импортируем новые
        const { error } = await supabase.from('markers').insert(data);
        if (error) {
            console.error('Error importing markers:', error);
        }
    };
    reader.readAsText(file);
}

async function clearMarkers() {
    if (!confirm('Удалить все метки?')) return;

    for (const m of markers) {
        await supabase.from('markers').delete().eq('id', m.id);
        map.removeLayer(m.marker);
    }
    markers = [];
}