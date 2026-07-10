// Проверяем, загрузился ли SDK
if (typeof window.supabase === 'undefined') {
    console.error('Supabase SDK не загружен! Проверь порядок скриптов в index.html');
} else {
    console.log('Supabase SDK загружен успешно');
}

// Создаем клиент
const sb = window.supabase.createClient(
    'https://jgbevmpurdyhkbibatjy.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnYmV2bXB1cmR5aGtiaWJhdGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MDMyMDUsImV4cCI6MjA5OTI3OTIwNX0.17qogBz5NJAeP4ktCBn929R_X3U4Ch4C0AujN53sCwI'
);

console.log('Клиент Supabase создан:', sb);