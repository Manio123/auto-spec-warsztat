const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./warsztat.db');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT, imgUrl TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, car TEXT, vin TEXT, phone TEXT, service_type TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'auto-spec-2026-secure', resave: false, saveUninitialized: true }));

const publicPath = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(publicPath));

app.get('/', (req, res) => { res.sendFile(path.join(publicPath, 'index.html')); });

// POPRAWIONA TRASA SKLEPU
app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        let cardsHtml = "";
        if (!rows || rows.length === 0) {
            cardsHtml = '<p style="text-align:center; grid-column: 1/-1; padding: 50px; font-size: 1.2em; color: #666;">Obecnie brak części w ofercie.</p>';
        } else {
            cardsHtml = rows.map(p => `
                <div class="product-card">
                    <img src="${p.imgUrl || 'https://via.placeholder.com/300x200?text=Część+Zamienna'}" alt="${p.name}">
                    <div class="product-details">
                        <h3>${p.name}</h3>
                        <p class="price">${p.price.toFixed(2)} PLN</p>
                        <p style="font-size:0.85em; color:#666; margin-bottom:15px; height:40px; overflow:hidden;">${p.desc || ''}</p>
                        <div style="display:flex; gap:10px; align-items:center; margin-bottom:15px;">
                            <label>Ilość:</label>
                            <input type="number" id="qty-${p.id}" value="1" min="1" style="width:60px; margin:0; padding:5px;">
                        </div>
                        <button class="btn" onclick="addToCart(${p.id}, '${p.name}', ${p.price}, document.getElementById('qty-${p.id}').value)">🛒 Dodaj do koszyka</button>
                    </div>
                </div>
            `).join('');
        }

        const templatePath = path.join(publicPath, 'sklep.html');
        if (fs.existsSync(templatePath)) {
            let html = fs.readFileSync(templatePath, 'utf8');
            // Wstrzykujemy kod produktów w miejsce komentarza HTML
            res.send(html.replace('', cardsHtml));
        } else {
            res.status(404).send("Błąd: Nie znaleziono pliku sklep.html");
        }
    });
});

app.post('/add-request-client', (req, res) => {
    const { client, car, vin, phone, service_type, desc } = req.body;
    db.run("INSERT INTO requests (client, car, vin, phone, service_type, desc) VALUES (?, ?, ?, ?, ?, ?)", 
    [client, car, vin, phone, service_type, desc], () => res.send("<script>alert('Zgłoszenie wysłane!'); window.location='/';</script>"));
});

// ADMIN
app.get('/login', (req, res) => {
    res.send('<html><head><link rel="stylesheet" href="style.css"></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;"><div class="card" style="width:320px;text-align:center;"><h2>Panel Admina</h2><form action="/login" method="POST"><input name="u" placeholder="Login" required><input type="password" name="p" placeholder="Hasło" required><button class="btn">Zaloguj</button></form></div></body></html>');
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') { req.session.isAdmin = true; res.redirect('/admin'); }
    else res.send("Błąd logowania!");
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests ORDER BY id DESC", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = reqs.map(r => `<div class="req-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding:10px; background:#f9f9f9; border-left:4px solid #1a3c61;"><div><b>${r.car}</b> (${r.client})<br><small>Tel: ${r.phone} | VIN: ${r.vin}</small></div><a href="/admin/del-r/${r.id}" class="btn" style="width:auto; background:#e74c3c; padding:5px 10px;">Usuń</a></div>`).join('');
            const pList = prods.map(p => `<li style="padding:5px; border-bottom:1px solid #eee;">${p.name} - ${p.price} zł <a href="/admin/del-p/${p.id}" style="color:red; float:right;">Usuń</a></li>`).join('');
            res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body class="container"><h1>Panel Manager</h1><div style="margin-bottom:20px;"><a href="/logout">Wyloguj</a> | <a href="/">Pokaż stronę</a></div><div style="display:flex;gap:30px;"><div style="flex:1"><h2>Zlecenia</h2>${rList || 'Brak zgłoszeń'}</div><div style="flex:1" class="card"><h2>Dodaj do Sklepu</h2><form action="/admin/add" method="POST"><input name="n" placeholder="Nazwa części" required><input name="pr" type="number" step="0.01" placeholder="Cena (np. 150.00)" required><input name="img" placeholder="Link do zdjęcia"><textarea name="d" placeholder="Opis"></textarea><button class="btn">Dodaj Produkt</button></form><ul style="margin-top:20px; list-style:none; padding:0;">${pList}</ul></div></div></body></html>`);
        });
    });
});

app.get('/admin/del-r/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM requests WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/admin/del-p/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM products WHERE id=?", req.params.id, () => res.redirect('/admin')); });

app.post('/admin/add', (req, res) => {
    if(req.session.isAdmin) {
        const { n, pr, d, img } = req.body;
        db.run("INSERT INTO products (name, price, desc, imgUrl) VALUES (?, ?, ?, ?)", [n, pr, d, img], () => res.redirect('/admin'));
    }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(process.env.PORT || 3000);
