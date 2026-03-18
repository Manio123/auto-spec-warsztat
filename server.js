const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./warsztat.db');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, car TEXT, vin TEXT, phone TEXT, service_type TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'auto-spec-2026', resave: false, saveUninitialized: true }));

const publicPath = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(publicPath));

app.get('/', (req, res) => { res.sendFile(path.join(publicPath, 'index.html')); });

app.post('/add-request-client', (req, res) => {
    const { client, car, vin, phone, service_type, desc } = req.body;
    db.run("INSERT INTO requests (client, car, vin, phone, service_type, desc) VALUES (?, ?, ?, ?, ?, ?)", 
    [client, car, vin, phone, service_type, desc], () => {
        res.send("<script>alert('Zgłoszenie przyjęte!'); window.location='/';</script>");
    });
});

app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        const cards = rows.map(p => `
            <div class="product-card">
                <h3>${p.name}</h3>
                <p class="price">${p.price} PLN</p>
                <p>${p.desc}</p>
                <button class="btn">Kup teraz</button>
            </div>
        `).join('');
        const html = fs.readFileSync(path.join(publicPath, 'sklep.html'), 'utf8');
        res.send(html.replace('', cards || '<p>Brak produktów.</p>'));
    });
});

app.get('/login', (req, res) => {
    res.send('<html><head><link rel="stylesheet" href="style.css"></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;"><div class="card" style="width:300px"><h2>Logowanie</h2><form action="/login" method="POST"><input name="u" placeholder="Login"><input type="password" name="p" placeholder="Hasło"><button class="btn">Zaloguj</button></form></div></body></html>');
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') { req.session.isAdmin = true; res.redirect('/admin'); }
    else { res.send("Błąd!"); }
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests ORDER BY id DESC", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = reqs.map(r => `<div class="req-item"><b>${r.car}</b> - ${r.client} (${r.phone})<br><small>${r.service_type}: ${r.desc}</small></div>`).join('');
            const pList = prods.map(p => `<li>${p.name} - ${p.price} PLN</li>`).join('');
            res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body class="container"><h1>Panel Admina</h1><a href="/">Strona Główna</a> | <a href="/logout">Wyloguj</a><div style="display:flex;gap:30px;"><div style="flex:1"><h2>Zlecenia</h2>${rList}</div><div style="flex:1" class="card"><h2>Dodaj produkt</h2><form action="/admin/add" method="POST"><input name="n" placeholder="Nazwa"><input name="pr" type="number" step="0.01" placeholder="Cena"><textarea name="d" placeholder="Opis"></textarea><button class="btn">Dodaj do sklepu</button></form><ul>${pList}</ul></div></div></body></html>`);
        });
    });
});

app.post('/admin/add', (req, res) => {
    if(req.session.isAdmin) db.run("INSERT INTO products (name, price, desc) VALUES (?, ?, ?)", [req.body.n, req.body.pr, req.body.d], () => res.redirect('/admin'));
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(process.env.PORT || 3000);
