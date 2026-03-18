const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./warsztat.db');

// --- INICJALIZACJA BAZY ---
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, car TEXT, vin TEXT, phone TEXT, service_type TEXT, desc TEXT, status TEXT DEFAULT 'Nowe')");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'warsztat-2026-secret', resave: false, saveUninitialized: true }));

const publicPath = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(publicPath));

// --- TRASY KLIENTA ---

app.get('/', (req, res) => { res.sendFile(path.join(publicPath, 'index.html')); });

// Wysyłanie zgłoszenia przez klienta
app.post('/add-request-client', (req, res) => {
    const { client, car, vin, phone, service_type, desc } = req.body;
    db.run("INSERT INTO requests (client, car, vin, phone, service_type, desc) VALUES (?, ?, ?, ?, ?, ?)", 
    [client, car, vin, phone, service_type, desc], () => {
        res.send("<script>alert('Zgłoszenie wysłane!'); window.location='/';</script>");
    });
});

// Sklep - wstawianie części w środek HTML
app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        const productCards = rows.map(p => `
            <div class="product-card">
                <h3>${p.name}</h3>
                <p class="price">${p.price} PLN</p>
                <p>${p.desc}</p>
                <button class="btn">Kup teraz</button>
            </div>
        `).join('');
        
        const sklepPath = path.join(publicPath, 'sklep.html');
        if (fs.existsSync(sklepPath)) {
            let html = fs.readFileSync(sklepPath, 'utf8');
            res.send(html.replace('', productCards || '<p>Brak towaru na magazynie.</p>'));
        } else { res.send(productCards); }
    });
});

// --- PANEL ADMINA ---

app.get('/login', (req, res) => {
    res.send('<html><head><link rel="stylesheet" href="style.css"></head><body class="login-page"><div class="product-card"><h2>Panel Admina</h2><form action="/login" method="POST"><input name="u" placeholder="Login"><input type="password" name="p" placeholder="Hasło"><button class="btn">Zaloguj</button></form></div></body></html>');
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else { res.send("Błąd!"); }
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests ORDER BY id DESC", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = reqs.map(r => `<div class="req-item"><b>${r.car}</b> - ${r.client} (Tel: ${r.phone})<br><small>${r.service_type}: ${r.desc}</small></div>`).join('');
            const pList = prods.map(p => `<li>${p.name} - ${p.price} PLN</li>`).join('');
            res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body style="padding:20px;"><h1>🛠 Warsztat Admin</h1><a href="/logout">Wyloguj</a><div style="display:flex; gap:20px;"><div style="flex:1;"><h2>Zlecenia</h2>${rList}</div><div style="flex:1;"><h2>Dodaj produkt</h2><form action="/admin/add-p" method="POST"><input name="n" placeholder="Nazwa"><input name="pr" type="number" step="0.01" placeholder="Cena"><textarea name="d" placeholder="Opis"></textarea><button class="btn">Dodaj</button></form><ul>${pList}</ul></div></div></body></html>`);
        });
    });
});

app.post('/admin/add-p', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.run("INSERT INTO products (name, price, desc) VALUES (?, ?, ?)", [req.body.n, req.body.pr, req.body.d], () => res.redirect('/admin'));
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Działa na porcie ${PORT}`));
