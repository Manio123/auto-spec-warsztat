const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const dbPath = path.resolve(__dirname, 'warsztat_v7.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT, imgUrl TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, phone TEXT, car TEXT, vin TEXT, service_type TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'auto-spec-2026', resave: false, saveUninitialized: true }));

const folder = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(folder));
const getFile = (name) => path.join(folder, name);

// --- KLIENT ---
app.get('/', (req, res) => res.sendFile(getFile('index.html')));
app.get('/koszyk', (req, res) => res.sendFile(getFile('koszyk.html')));
app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        let cards = (rows && rows.length > 0) ? rows.map(p => `
            <div class="product-card">
                <img src="${p.imgUrl || 'https://via.placeholder.com/300x200?text=Auto-Spec'}" alt="${p.name}">
                <div class="product-details">
                    <h3>${p.name}</h3>
                    <p class="price">${Number(p.price).toFixed(2)} PLN</p>
                    <button class="btn" onclick="addToCart(${p.id}, '${p.name}', ${p.price})">🛒 Dodaj</button>
                </div>
            </div>`).join('') : '<p style="text-align:center; padding:50px;">Brak produktów.</p>';
        const html = fs.readFileSync(getFile('sklep.html'), 'utf8');
        res.send(html.replace('', cards));
    });
});

app.post('/add-request-client', (req, res) => {
    const { client, phone, car, vin, service_type, desc } = req.body;
    db.run("INSERT INTO requests (client, phone, car, vin, service_type, desc) VALUES (?,?,?,?,?,?)", 
    [client, phone, car, vin, service_type, desc], (err) => {
        if (err) return res.status(500).send("Błąd: " + err.message);
        res.send("<script>alert('Zlecenie wysłane!'); window.location='/';</script>");
    });
});

// --- ADMIN ---
app.get('/login', (req, res) => {
    res.send('<html><head><link rel="stylesheet" href="style.css"></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;"><div class="card" style="text-align:center;"><h2>Panel Admina</h2><form action="/login" method="POST"><input name="u" placeholder="Login" required><input type="password" name="p" placeholder="Hasło" required><button class="btn">Zaloguj</button></form></div></body></html>');
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') { req.session.isAdmin = true; res.redirect('/admin'); }
    else res.send("Błąd logowania");
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests ORDER BY id DESC", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = (reqs || []).map(r => `
                <div style="padding:10px; border-bottom:20px solid #f4f6f9; background:#fff;">
                    <b>🚗 ${r.car}</b> - ${r.service_type} <a href="/admin/del-r/${r.id}" style="color:red; float:right;">Usuń</a><br>
                    <small>👤 ${r.client} | 📞 ${r.phone} | 🔑 VIN: ${r.vin || 'Brak'}</small><br>
                    <p style="background:#eee; padding:5px; margin-top:5px;">📝 Opis: ${r.desc || 'Brak'}</p>
                </div>`).join('');
            const pList = (prods || []).map(p => `<li>${p.name} - ${p.price} zł <a href="/admin/del-p/${p.id}" style="color:red;">[X]</a></li>`).join('');
            res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body class="container"><h1>Panel Zarządzania</h1><a href="/logout">Wyloguj</a> | <a href="/sklep">Sklep</a><div style="display:flex; gap:20px; margin-top:20px;"><div style="flex:1;"><h3>Ostatnie Zlecenia:</h3>${rList}</div><div style
