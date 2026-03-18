const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./warsztat.db');

// Inicjalizacja bazy
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT, imgUrl TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, car TEXT, vin TEXT, phone TEXT, service_type TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'auto-spec-2026-warsztat-key', resave: false, saveUninitialized: true }));

const publicPath = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(publicPath));

// --- TRASY DLA KLIENTA ---
app.get('/', (req, res) => { res.sendFile(path.join(publicPath, 'index.html')); });

app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        const cards = rows.map(p => `
            <div class="product-card">
                <img src="${p.imgUrl || 'https://via.placeholder.com/300x200?text=Część'}" alt="${p.name}">
                <div class="product-details">
                    <h3>${p.name}</h3>
                    <p class="price">${p.price.toFixed(2)} PLN</p>
                    <p style="font-size:0.9em; color:#666; margin-bottom:15px;">${p.desc || 'Brak opisu.'}</p>
                    <div style="display:flex; gap:10px; align-items:center; margin-bottom:15px;">
                        <label style="font-size:0.9em;">Ilość:</label>
                        <input type="number" id="qty-${p.id}" value="1" min="1" style="width:70px; margin:0; padding:8px;">
                    </div>
                    <button class="btn" onclick="addToCart('${p.id}', '${p.name}', ${p.price}, document.getElementById('qty-${p.id}').value)">🛒 Dodaj</button>
                </div>
            </div>
        `).join('');
        const html = fs.readFileSync(path.join(publicPath, 'sklep.html'), 'utf8');
        res.send(html.replace('', cards || '<p>Obecnie brak części w sklepie.</p>'));
    });
});

app.post('/add-request-client', (req, res) => {
    const { client, car, vin, phone, service_type, desc } = req.body;
    db.run("INSERT INTO requests (client, car, vin, phone, service_type, desc) VALUES (?, ?, ?, ?, ?, ?)", 
    [client, car, vin, phone, service_type, desc], () => res.send("<script>alert('Zlecenie wysłane! Odezwiemy się.'); window.location='/';</script>"));
});

// --- PANEL ADMINA ---
app.get('/login', (req, res) => {
    res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#eee;"><div class="card" style="width:350px; text-align:center;"><h2>Panel Managera</h2><form action="/login" method="POST"><input name="u" placeholder="Login" required><input type="password" name="p" placeholder="Hasło" required><button class="btn">Zaloguj</button></form></div></body></html>`);
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') { req.session.isAdmin = true; res.redirect('/admin'); }
    else { res.send("Błąd logowania! <a href='/login'>Spróbuj ponownie</a>"); }
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests ORDER BY id DESC", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = reqs.map(r => `
                <div class="req-item" style="display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <b>🚗 ${r.car}</b> - ${r.client} (${r.phone})<br>
                        <small>VIN: ${r.vin || 'brak'} | Typ: ${r.service_type}<br>Opis: ${r.desc}</small>
                    </div>
                    <a href="/admin/delete-request/${r.id}" class="btn btn-danger" style="padding: 8px 15px; font-size: 0.8em; text-decoration:none;" onclick="return confirm('Czy na pewno chcesz usunąć to zlecenie?')">Usuń</a>
                </div>
            `).join('');
            
            const pList = prods.map(p => `
                <li style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:5px;">
                    <span>${p.name} - <b>${p.price.toFixed(2)} zł</b></span>
                    <a href="/admin/delete-product/${p.id}" class="btn btn-danger" style="padding: 5px 10px; font-size: 0.7em; text-decoration:none;" onclick="return confirm('Usunąć produkt ze sklepu?')">Usuń</a>
                </li>
            `).join('');

            res.send(`
                <html><head><link rel="stylesheet" href="style.css"></head>
                <body class="container">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h1>🛠 Warsztat Admin</h1>
                        <a href="/logout" class="btn btn-danger" style="text-decoration:none;">Wyloguj</a>
                    </div>
                    <div style="display:flex;gap:30px; margin-top:30px;">
                        <div style="flex:2">
                            <h2>Nowe Zlecenia</h2>
                            ${rList || '<p>Brak nowych zleceń.</p>'}
                        </div>
                        <div style="flex:1">
                            <div class="card">
                                <h2>Dodaj Produkt</h2>
                                <form action="/admin/add" method="POST">
                                    <input name="n" placeholder="Nazwa części" required>
                                    <input name="pr" type="number" step="0.01" placeholder="Cena" required>
                                    <input name="img" placeholder="Link do zdjęcia">
                                    <textarea name="d" placeholder="Opis"></textarea>
                                    <button class="btn">Dodaj do sklepu</button>
                                </form>
                            </div>
                            <h3>Produkty w Sklepie:</h3>
                            <ul class="card" style="list-style:none; padding:15px;">${pList || 'Brak produktów'}</ul>
                        </div>
                    </div>
                </body></html>
            `);
        });
    });
});

// LOGIKA USUWANIA (NOWE)
app.get('/admin/delete-request/:id', (req, res) => {
    if(req.session.isAdmin) {
        db.run("DELETE FROM requests WHERE id = ?", req.params.id, () => res.redirect('/admin'));
    }
});

app.get('/admin/delete-product/:id', (req, res) => {
    if(req.session.isAdmin) {
        db.run("DELETE FROM products WHERE id = ?", req.params.id, () => res.redirect('/admin'));
    }
});

app.post('/admin/add', (req, res) => {
    if(req.session.isAdmin) db.run("INSERT INTO products (name, price, desc, imgUrl) VALUES (?, ?, ?, ?)", [req.body.n, req.body.pr, req.body.d, req.body.img], () => res.redirect('/admin'));
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Warsztat śmiga na porcie ${PORT}`));
