const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./warsztat.db');

// Baza danych
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, car TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({ secret: 'auto-spec-2026', resave: false, saveUninitialized: true }));

// --- TRASY ---

// Strona główna (Serwis)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Sklep (Osobna strona)
app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        const productCards = rows.map(p => `
            <div class="product-card">
                <div class="img-placeholder">Część</div>
                <h3>${p.name}</h3>
                <p>${p.desc || ''}</p>
                <p><strong>${p.price} PLN</strong></p>
                <button class="btn">Dodaj do koszyka</button>
            </div>
        `).join('');

        const filePath = path.join(__dirname, 'public', 'sklep.html');
        let html = fs.readFileSync(filePath, 'utf8');
        res.send(html.replace('', productCards || '<p>Brak produktów w sklepie.</p>'));
    });
});

// Rezerwacja serwisu
app.post('/book-service', (req, res) => {
    const { client, car, desc } = req.body;
    db.run("INSERT INTO requests (client, car, desc) VALUES (?, ?, ?)", [client, car, desc], () => {
        res.send('<body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Zgłoszenie przyjęte!</h2><a href="/">Wróć do strony</a></body>');
    });
});

// Admin Panel
app.get('/login', (req, res) => {
    res.send('<html><head><link rel="stylesheet" href="style.css"></head><body><div class="container" style="max-width:400px;margin-top:100px;"><div class="product-card"><h2>Logowanie Admin</h2><form action="/login" method="POST"><input name="u" placeholder="Login"><input type="password" name="p" placeholder="Hasło"><button class="btn">Zaloguj</button></form></div></div></body></html>');
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else { res.send('Błąd logowania!'); }
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = reqs.map(r => `<li><strong>${r.client}</strong>: ${r.car} (${r.desc})</li>`).join('');
            const pList = prods.map(p => `<li>${p.name} - ${p.price} PLN</li>`).join('');
            res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body><header><nav><a href="/" class="logo">Admin<span>Panel</span></a><ul><li><a href="/logout">Wyloguj</a></li></ul></nav></header><div class="container"><div class="product-grid"><div class="product-card"><h3>Zlecenia serwisowe:</h3><ul style="text-align:left;padding:10px;">${rList || 'Brak'}</ul></div><div class="product-card"><h3>Dodaj do sklepu:</h3><form action="/add-p" method="POST"><input name="n" placeholder="Nazwa"><input name="pr" placeholder="Cena"><input name="d" placeholder="Opis"><button class="btn">Dodaj produkt</button></form><hr><ul style="text-align:left;padding:10px;">${pList}</ul></div></div></div></body></html>`);
        });
    });
});

app.post('/add-p', (req, res) => {
    if(req.session.isAdmin) db.run("INSERT INTO products (name, price, desc) VALUES (?, ?, ?)", [req.body.n, req.body.pr, req.body.d], () => res.redirect('/admin'));
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(3000, () => console.log('Serwer działa: http://localhost:3000'));