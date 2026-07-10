const firebaseConfig = {
    apiKey: "AIzaSyCO3HUyaX1fpBrkc09hfn4jec7zIXCHTYw",
    authDomain: "mta-map-14df4.firebaseapp.com",
    databaseURL: "https://mta-map-14df4-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "mta-map-14df4",
    storageBucket: "mta-map-14df4.firebasestorage.app",
    messagingSenderId: "326508782029",
    appId: "1:326508782029:web:9e400f46a0ea4df5bd2484"
};

// Инициализация через compat SDK (используем глобальный объект firebase)
firebase.initializeApp(firebaseConfig);

// Создаем объект для работы с базой данных
const db = firebase.database();