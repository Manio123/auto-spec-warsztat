const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();

// Ścieżka do bazy danych - używamy path.resolve dla pewności zapisu
const dbPath = path.resolve(__dirname, 'warsztat.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Błąd połączenia z bazą:", err.message);
    else console.log("Połączono z bazą danych SQLite.");
});

// INICJALIZACJA TABEL (Naprawa błędu zapisu)
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        name TEXT, 
        price REAL, 
        desc TEXT, 
        imgUrl TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        client TEXT, 
        phone TEXT, 
        car TEXT, 
        vin TEXT, 
        service_type TEXT, 
        desc TEXT
    )`);
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ 
    secret: 'auto-spec-final-2026', 
    resave: false, 
    saveUninitialized: true 
}));

const publicPath = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(publicPath));

// --- TRASY ---

app.get('/', (req, res) => { res.sendFile(path.join(publicPath, 'index.html')); });

// POPRAWIONA OBSŁUGA ZLECENIA
app.post('/add-request-client', (req, res) => {
    const { client, phone, car, vin, service_type, desc } = req.body;
    
    // Logujemy co wpada, żeby widzieć w konsoli Rendera
    console.log("Próba zapisu zlecenia:", client, car);

    const sql = "INSERT INTO requests (client, phone, car, vin, service_type, desc) VALUES (?, ?, ?, ?, ?, ?)";
    
    db.run(sql, [client, phone, car, vin, service_type, desc], function(err) {
        if (err) {
            console.error("BŁĄD SQL:", err.message);
            return res.status(500).send("Błąd zapisu w bazie: " + err.message);
        }
        console.log("Zlecenie zapisane pomyślnie, ID:", this.lastID);
        res.send("<script>alert('Zlecenie wysłane pomyślnie!'); window.location.href='/';</script>");
    });
});

app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        let cardsHtml = "";
        if (!rows || rows.length === 0) {
            cardsHtml = '<div style="grid-column: 1/-1; text-align:center; padding:50px;"><h3>Brak części. Dodaj je w panelu admina.</h3></div>';
        } else {
            cardsHtml = rows.map(p => `
                <div class="product-card">
                    <img src="${p.imgUrl || 'https://via.placeholder.com/300x200?text=Czesc'}" alt="${p.name}">
                    <div class="product-details">
                        <h3>${p.name}</h3>
                        <p class="price">${p.price.toFixed(2)} PLN</p>
                        <p style="font-size:0.85em; color:#666;">${p.desc || ''}</p>
                        <button class="btn" onclick="addToCart(${p.id}, '${p.name}', ${p.price})">🛒 Dodaj</button>
                    </div>
                </div>
            `).join('');
        }
        const html = fs.readFileSync(path.join(publicPath, 'sklep.html'), 'utf8');
        res.send(html.replace('', cardsHtml));
    });
});

app.get('/koszyk', (req, res) => { res.sendFile(path.join(publicPath, 'koszyk.html')); });

// --- ADMIN ---
app.get('/login', (req, res) => {
    res.send('<html><head><link rel="stylesheet" href="style.css"></head><body style="display:flex;justify-content:center;align
