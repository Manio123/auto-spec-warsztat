const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
// Zmieniamy bazę na v8, aby upewnić się, że wszystkie kolumny (phone, desc, service_type) są na miejscu
const dbPath = path.resolve(__dirname, 'warsztat_v8.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT, imgUrl TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, phone TEXT, car TEXT, vin TEXT, service_type TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'auto-spec-secret-key', resave: false, saveUninitialized: true }));

const folder = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(folder));
const getFile = (name) => path.join(folder, name);

// --- TRASY KLIENTA ---
app.get('/', (req, res) => res.sendFile(getFile('index.html')));
app.get('/koszyk', (req, res) => res.sendFile(getFile('koszyk.html')));
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
            </div>`).join('') : '<p style="text-align:center; padding:50px;">Brak produktów w sklepie.</p>';
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

// --- PANEL ADMINA ---
app.get('/login', (req, res) => {
    res.send('<html><head><link rel="stylesheet" href="style.css"></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;"><div class="card" style="text-align:center;"><h2>Panel Admina</h2><form action="/login" method="POST"><input name="u" placeholder="Login" required style="margin-bottom:10px;"><br><input type="password" name="p" placeholder="Hasło" required style="margin-bottom:10px;"><br><button class="btn">Zaloguj</button></form></div></body></html>');
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') { req.session.isAdmin = true; res.redirect('/admin'); }
    else res.send("Błędne dane. <a href='/login'>Wróć</a>");
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    
    db.all("SELECT * FROM requests ORDER BY id DESC", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            
            // TUTAJ POPRAWIONE WYŚWIETLANIE ZLECEŃ:
            const rList = (reqs || []).map(r => `
                <div style="padding:15px; border:1px solid #ddd; border-radius:8px; background:#fff; margin-bottom:15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:10px;">
                        <span style="font-weight:bold; font-size:1.1em; color:#1a3c61;">🚗 ${r.car}</span>
                        <span style="background:#f0c04a; color:#1a3c61; padding:3px 8px; border-radius:4px; font-size:0.85em; font-weight:bold;">${r.service_type}</span>
                    </div>
                    <p style="margin:5px 0;">👤 <b>Klient:</b> ${r.client}</p>
                    <p style="margin:5px 0;">📞 <b>Telefon:</b> ${r.phone}</p>
                    <p style="margin:5px 0;">🔑 <b>VIN:</b> ${r.vin || 'Nie podano'}</p>
                    <div style="margin-top:10px; padding:10px; background:#f9f9f9; border-radius:4px; border-left:4px solid #1a3c61;">
                        <b>📝 Opis usterki:</b><br>
                        <span style="white-space: pre-wrap;">${r.desc || 'Brak dodatkowego opisu.'}</span>
                    </div>
                    <div style="text-align:right; margin-top:10px;">
                        <a href="/admin/del-r/${r.id}" style="color:red; text-decoration:none; font-size:0.9em; font-weight:bold;">[USUŃ ZLECENIE]</a>
                    </div>
                </div>`).join('');

            const pList = (prods || []).map(p => `<li>${p.name} - ${p.price} zł <a href="/admin/del-p/${p.id}" style="color:red;">[X]</a></li>`).join('');

            res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body class="container">
                <h1>Panel Zarządzania Warsztatem</h1>
                <nav style="background:none; padding:0; margin-bottom:20px;"><a href="/">Strona Główna</a> | <a href="/logout" style="color:red;">Wyloguj</a></nav>
                <div style="display:flex; gap:30px;">
                    <div style="flex:2;">
                        <h3>📥 Nowe Zlecenia:</h3>
                        ${rList || '<p>Brak nowych zgłoszeń.</p>'}
                    </div>
                    <div style="flex:1;">
                        <div class="card">
                            <h3>📦 Dodaj część:</h3>
                            <form action="/admin/add" method="POST">
                                <input name="n" placeholder="Nazwa części" required>
                                <input name="pr" type="number" step="0.01" placeholder="Cena" required>
                                <input name="img" placeholder="Link do zdjęcia">
                                <textarea name="d" placeholder="Opis części"></textarea>
                                <button class="btn">Dodaj do sklepu</button>
                            </form>
                            <hr>
                            <h4>Produkty w sklepie:</h4>
                            <ul style="padding-left:20px;">${pList}</ul>
                        </div>
                    </div>
                </div>
            </body></html>`);
        });
    });
});

app.post('/admin/add', (req, res) => { if(req.session.isAdmin) db.run("INSERT INTO products (name, price, desc, imgUrl) VALUES (?,?,?,?)", [req.body.n, req.body.pr, req.body.d, req.body.img], () => res.redirect('/admin')); });
app.get('/admin/del-r/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM requests WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/admin/del-p/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM products WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(process.env.PORT || 3000);
