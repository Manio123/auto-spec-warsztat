const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
// Używamy v9, aby mieć pewność, że baza jest czysta po tych zmianach
const dbPath = path.resolve(__dirname, 'warsztat_v9.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT, imgUrl TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, phone TEXT, car TEXT, vin TEXT, service_type TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'super-bezpieczny-klucz-auto-spec', resave: false, saveUninitialized: true }));

const folder = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(folder));
const getFile = (name) => path.join(folder, name);

// --- TRASY KLIENTA ---
app.get('/', (req, res) => res.sendFile(getFile('index.html')));
app.get('/koszyk', (req, res) => res.sendFile(getFile('koszyk.html')));

app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        let cards = '';
        
        // --- POPRAWKA TUTAJ: Komunikat jest owinięty w 'container card' ---
        if (rows && rows.length > 0) {
            cards = rows.map(p => {
                const img = p.imgUrl && p.imgUrl.length > 5 ? p.imgUrl : 'https://via.placeholder.com/300x200?text=Część';
                return `
                <div class="product-card">
                    <img src="${img}" alt="${p.name}">
                    <div class="product-details">
                        <h3>${p.name}</h3>
                        <p class="price">${Number(p.price).toFixed(2)} PLN</p>
                        <button class="btn" onclick="addToCart(${p.id}, '${p.name}', ${p.price})">🛒 Dodaj do koszyka</button>
                    </div>
                </div>`;
            }).join('');
        } else {
            // Ten kod przenosi napis na środek
            cards = '<div class="container" style="text-align:center; padding:50px;"><h3>Obecnie brak części w ofercie.</h3></div>';
        }
        
        const html = fs.readFileSync(getFile('sklep.html'), 'utf8');
        // Wstawiamy komunikat w odpowiednie miejsce w szablonie (pod nagłówkiem)
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

// --- PANEL ADMINA ---
app.get('/login', (req, res) => {
    res.send('<html><head><link rel="stylesheet" href="style.css"></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;"><div class="card" style="width:300px;text-align:center;"><h2>Panel Admina</h2><form action="/login" method="POST"><input name="u" placeholder="Login" required><br><input type="password" name="p" placeholder="Hasło" required><br><button class="btn">Zaloguj</button></form></div></body></html>');
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') { req.session.isAdmin = true; res.redirect('/admin'); }
    else res.send("Błąd logowania. <a href='/login'>Wróć</a>");
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests ORDER BY id DESC", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = (reqs || []).map(r => `
                <div style="padding:15px; border:1px solid #ddd; border-radius:5px; background:#fff; margin-bottom:15px;">
                    <b>🚗 ${r.car}</b> - ${r.service_type} <a href="/admin/del-r/${r.id}" style="color:red; float:right; text-decoration:none;">[Usuń]</a><br>
                    <small>👤 ${r.client} | 📞 ${r.phone} | 🔑 VIN: ${r.vin || 'Brak'}</small><br>
                    <p style="background:#f9f9f9; padding:5px; margin-top:5px;">📝 Opis usterki: ${r.desc || 'Brak'}</p>
                </div>`).join('');
            const pList = (prods || []).map(p => `<li>${p.name} - ${p.price} zł <a href="/admin/del-p/${p.id}" style="color:red;">[X]</a></li>`).join('');
            res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body class="container"><h1>Panel Zarządzania</h1><a href="/logout">Wyloguj</a> | <a href="/sklep">Sklep</a><div style="display:flex; gap:20px; margin-top:20px;"><div style="flex:2;"><h3>Ostatnie Zlecenia:</h3>${rList || 'Brak zgłoszeń'}</div><div style="flex:1;" class="card"><h3>Dodaj produkt:</h3><form action="/admin/add" method="POST"><input name="n" placeholder="Nazwa części" required><input name="pr" type="number" step="0.01" placeholder="Cena" required><input name="img" placeholder="Link do zdjęcia"><textarea name="d" placeholder="Opis"></textarea><button class="btn">Dodaj do Sklepu</button></form><ul>${pList}</ul></div></div></body></html>`);
        });
    });
});

app.post('/admin/add', (req, res) => { if(req.session.isAdmin) db.run("INSERT INTO products (name, price, desc, imgUrl) VALUES (?,?,?,?)", [req.body.n, req.body.pr, req.body.d, req.body.img], () => res.redirect('/admin')); });
app.get('/admin/del-r/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM requests WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/admin/del-p/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM products WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(process.env.PORT || 3000);
