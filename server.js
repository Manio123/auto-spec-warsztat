const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const dbPath = path.resolve(__dirname, 'warsztat.db');

// Otwieramy bazę z trybem zapisu i odczytu
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) console.error("Błąd bazy:", err.message);
});

// Konfiguracja dla lepszej wydajności na serwerze
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA busy_timeout = 5000;");

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT, imgUrl TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, phone TEXT, car TEXT, vin TEXT, service_type TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'auto-spec-final-lock', resave: false, saveUninitialized: true }));

const publicPath = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(publicPath));

// --- TRASY KLIENTA ---
app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.get('/koszyk', (req, res) => res.sendFile(path.join(publicPath, 'koszyk.html')));

app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        let cards = (rows && rows.length > 0) ? rows.map(p => `
            <div class="product-card">
                <img src="${p.imgUrl || 'https://via.placeholder.com/300x200?text=Czesc'}" alt="${p.name}">
                <div class="product-details">
                    <h3>${p.name}</h3>
                    <p class="price">${Number(p.price).toFixed(2)} PLN</p>
                    <p style="font-size:0.8em; color:#666;">${p.desc || ''}</p>
                    <button class="btn" onclick="addToCart(${p.id}, '${p.name}', ${p.price})">🛒 Dodaj</button>
                </div>
            </div>`).join('') : '<p style="grid-column:1/-1; text-align:center; padding:50px;">Brak produktów w bazie.</p>';
        
        const html = fs.readFileSync(path.join(publicPath, 'sklep.html'), 'utf8');
        res.setHeader('Cache-Control', 'no-cache'); // WYMUSZA ODŚWIEŻENIE
        res.send(html.replace('', cards));
    });
});

app.post('/add-request-client', (req, res) => {
    const { client, phone, car, vin, service_type, desc } = req.body;
    db.run("INSERT INTO requests (client, phone, car, vin, service_type, desc) VALUES (?,?,?,?,?,?)", 
    [client, phone, car, vin, service_type, desc], (err) => {
        if (err) return res.status(500).send("Błąd zapisu zlecenia: " + err.message);
        res.send("<script>alert('Zlecenie wysłane!'); window.location='/';</script>");
    });
});

// --- ADMIN ---
app.get('/login', (req, res) => {
    res.send('<html><head><link rel="stylesheet" href="style.css"></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;"><div class="card" style="width:300px;text-align:center;"><h2>Panel Admina</h2><form action="/login" method="POST"><input name="u" placeholder="Login"><input type="password" name="p" placeholder="Hasło"><button class="btn">Zaloguj</button></form></div></body></html>');
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') { req.session.isAdmin = true; res.redirect('/admin'); }
    else res.send("Błąd");
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests ORDER BY id DESC", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = (reqs || []).map(r => `<div style="padding:10px; border-bottom:1px solid #ddd;"><b>${r.car}</b> - ${r.client} <a href="/admin/del-r/${r.id}" style="color:red; float:right;">Usuń</a></div>`).join('');
            const pList = (prods || []).map(p => `<li>${p.name} - ${p.price} zł <a href="/admin/del-p/${p.id}" style="color:red; float:right;">Usuń</a></li>`).join('');
            res.setHeader('Cache-Control', 'no-cache');
            res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body class="container"><h1>Admin</h1><a href="/logout">Wyloguj</a> | <a href="/sklep">Sklep</a><div style="display:flex; gap:20px; margin-top:20px;"><div style="flex:1;"><h3>Zlecenia:</h3>${rList}</div><div style="flex:1;" class="card"><h3>Dodaj produkt:</h3><form action="/admin/add" method="POST"><input name="n" placeholder="Nazwa" required><input name="pr" type="number" step="0.01" placeholder="Cena" required><input name="img" placeholder="Link do foto"><textarea name="d" placeholder="Opis"></textarea><button class="btn">Dodaj produkt</button></form><ul>${pList}</ul></div></div></body></html>`);
        });
    });
});

app.post('/admin/add', (req, res) => {
    if(req.session.isAdmin) {
        const { n, pr, d, img } = req.body;
        db.run("INSERT INTO products (name, price, desc, imgUrl) VALUES (?,?,?,?)", [n, pr, d, img], (err) => {
            if (err) console.error("Błąd dodawania produktu:", err.message);
            res.redirect('/admin');
        });
    }
});

app.get('/admin/del-r/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM requests WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/admin/del-p/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM products WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(process.env.PORT || 3000);
