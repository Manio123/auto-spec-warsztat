const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();

// NOWA BAZA v6 - Naprawia błąd "no column named phone" oraz błędy zapisu
const dbPath = path.resolve(__dirname, 'warsztat_v6.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT, imgUrl TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, phone TEXT, car TEXT, vin TEXT, service_type TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ 
    secret: 'auto-spec-ultra-secret-2026', 
    resave: false, 
    saveUninitialized: true,
    cookie: { secure: false } 
}));

// Wykrywanie folderu z plikami (naprawa błędu ENOENT)
const folder = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(folder));
const getFile = (name) => path.join(folder, name);

// --- TRASY KLIENTA ---
app.get('/', (req, res) => res.sendFile(getFile('index.html')));
app.get('/koszyk', (req, res) => res.sendFile(getFile('koszyk.html')));

app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        let cards = (rows && rows.length > 0) ? rows.map(p => {
            const img = p.imgUrl && p.imgUrl.length > 5 ? p.imgUrl : 'https://via.placeholder.com/300x200?text=Auto-Spec';
            return `
            <div class="product-card">
                <img src="${img}" alt="${p.name}">
                <div class="product-details">
                    <h3>${p.name}</h3>
                    <p class="price">${Number(p.price).toFixed(2)} PLN</p>
                    <button class="btn" onclick="addToCart(${p.id}, '${p.name}', ${p.price})">🛒 Dodaj</button>
                </div>
            </div>`;
        }).join('') : '<p style="text-align:center; padding:50px;">Brak części w ofercie.</p>';
        
        const html = fs.readFileSync(getFile('sklep.html'), 'utf8');
        res.send(html.replace('', cards));
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

// --- ADMIN (LOGOWANIE I PANEL) ---
app.get('/login', (req, res) => {
    res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;">
    <div class="card" style="width:320px;text-align:center;">
        <h2>Logowanie Admina</h2>
        <form action="/login" method="POST">
            <input name="u" placeholder="Login" required>
            <input type="password" name="p" placeholder="Hasło" required>
            <button class="btn">Zaloguj się</button>
        </form><br><a href="/">Powrót</a>
    </div></body></html>`);
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') { 
        req.session.isAdmin = true; 
        req.session.save(() => res.redirect('/admin'));
    } else res.send("Błędne dane! <a href='/login'>Spróbuj ponownie</a>");
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests ORDER BY id DESC", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = (reqs || []).map(r => `<div style="padding:10px; border-bottom:1px solid #ddd;"><b>${r.car}</b> - ${r.client} (${r.phone}) <a href="/admin/del-r/${r.id}" style="color:red; float:right;">Usuń</a></div>`).join('');
            const pList = (prods || []).map(p => `<li>${p.name} - ${p.price} zł <a href="/admin/del-p/${p.id}" style="color:red; float:right;">[X]</a></li>`).join('');
            res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body class="container">
                <h1>Panel Admina</h1>
                <nav style="background:none; padding:0; margin-bottom:20px;"><a href="/">Strona Główna</a> | <a href="/logout" style="color:red;">Wyloguj</a></nav>
                <div style="display:flex; gap:20px;">
                    <div style="flex:1.5;"><h3>Zlecenia:</h3>${rList || 'Brak'}</div>
                    <div style="flex:1;" class="card">
                        <h3>Dodaj produkt:</h3>
                        <form action="/admin/add" method="POST">
                            <input name="n" placeholder="Nazwa" required>
                            <input name="pr" type="number" step="0.01" placeholder="Cena" required>
                            <input name="img" placeholder="Link do zdjęcia">
                            <textarea name="d" placeholder="Opis"></textarea>
                            <button class="btn">Dodaj produkt</button>
                        </form>
                        <ul style="margin-top:20px;">${pList}</ul>
                    </div>
                </div></body></html>`);
        });
    });
});

app.post('/admin/add', (req, res) => { if(req.session.isAdmin) db.run("INSERT INTO products (name, price, desc, imgUrl) VALUES (?,?,?,?)", [req.body.n, req.body.pr, req.body.d, req.body.img], () => res.redirect('/admin')); });
app.get('/admin/del-r/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM requests WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/admin/del-p/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM products WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(process.env.PORT || 3000);
