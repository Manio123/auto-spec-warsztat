const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();

// NOWA BAZA - To naprawi błąd "no column named phone"
const dbPath = path.resolve(__dirname, 'warsztat_v3.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT, imgUrl TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, phone TEXT, car TEXT, vin TEXT, service_type TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'super-tajne-auto-spec', resave: false, saveUninitialized: true }));

// Naprawa ścieżek (ENOENT)
const folder = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(folder));
const getFile = (name) => path.join(folder, name);

// --- KLIENT ---
app.get('/', (req, res) => res.sendFile(getFile('index.html')));
app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        let cards = (rows && rows.length > 0) ? rows.map(p => `
            <div class="product-card">
                <img src="${p.imgUrl || 'https://via.placeholder.com/300x200?text=Czesc'}" alt="${p.name}">
                <div class="product-details">
                    <h3>${p.name}</h3>
                    <p class="price">${Number(p.price).toFixed(2)} PLN</p>
                    <button class="btn" onclick="addToCart(${p.id}, '${p.name}', ${p.price})">🛒 Dodaj</button>
                </div>
            </div>`).join('') : '<p style="text-align:center; padding:50px;">Brak części w sklepie.</p>';
        
        if(fs.existsSync(getFile('sklep.html'))) {
            const html = fs.readFileSync(getFile('sklep.html'), 'utf8');
            res.send(html.replace('', cards));
        } else res.send("Błąd: Brak pliku sklep.html");
    });
});

app.post('/add-request-client', (req, res) => {
    const { client, phone, car, vin, service_type, desc } = req.body;
    db.run("INSERT INTO requests (client, phone, car, vin, service_type, desc) VALUES (?,?,?,?,?,?)", 
    [client, phone, car, vin, service_type, desc], (err) => {
        if (err) return res.status(500).send("Błąd bazy: " + err.message);
        res.send("<script>alert('Zlecenie wysłane!'); window.location='/';</script>");
    });
});

// --- ADMIN (LOGIN I PANEL) ---
app.get('/login', (req, res) => {
    res.send('<html><head><link rel="stylesheet" href="style.css"></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;"><div class="card" style="width:300px;text-align:center;"><h2>Panel Admina</h2><form action="/login" method="POST"><input name="u" placeholder="Login" required><input type="password" name="p" placeholder="Hasło" required><button class="btn">Zaloguj</button></form></div></body></html>');
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') { req.session.isAdmin = true; res.redirect('/admin'); }
    else res.send("Błąd logowania. <a href='/login'>Spróbuj ponownie</a>");
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests ORDER BY id DESC", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = (reqs || []).map(r => `<div style="padding:10px; border-bottom:1px solid #ddd;"><b>${r.car}</b> - ${r.client} (${r.phone}) <a href="/admin/del-r/${r.id}" style="color:red; float:right;">Usuń</a></div>`).join('');
            const pList = (prods || []).map(p => `<li>${p.name} - ${p.price} zł <a href="/admin/del-p/${p.id}" style="color:red; float:right;">Usuń</a></li>`).join('');
            res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body class="container"><h1>Panel Manager</h1><a href="/logout">Wyloguj</a> | <a href="/sklep">Zobacz Sklep</a><div style="display:flex; gap:20px; margin-top:20px;"><div style="flex:1;"><h3>Zlecenia:</h3>${rList || 'Brak zleceń'}</div><div style="flex:1;" class="card"><h3>Dodaj produkt:</h3><form action="/admin/add" method="POST"><input name="n" placeholder="Nazwa części" required><input name="pr" type="number" step="0.01" placeholder="Cena" required><input name="img" placeholder="Link do zdjęcia"><textarea name="d" placeholder="Opis"></textarea><button class="btn">Dodaj do Sklepu</button></form><ul style="margin-top:20px;">${pList}</ul></div></div></body></html>`);
        });
    });
});

app.post('/admin/add', (req, res) => {
    if(req.session.isAdmin) {
        db.run("INSERT INTO products (name, price, desc, imgUrl) VALUES (?,?,?,?)", [req.body.n, req.body.pr, req.body.d, req.body.img], () => res.redirect('/admin'));
    }
});

app.get('/admin/del-r/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM requests WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/admin/del-p/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM products WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(process.env.PORT || 3000);
