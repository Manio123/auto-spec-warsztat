const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./warsztat.db');

// Tworzenie tabel (Zlecenia + Produkty)
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT, imgUrl TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, car TEXT, vin TEXT, phone TEXT, service_type TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'auto-spec-ultra-secret-2026', resave: false, saveUninitialized: true }));

const publicPath = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(publicPath));

// --- STRONA GŁÓWNA ---
app.get('/', (req, res) => { res.sendFile(path.join(publicPath, 'index.html')); });

// --- OBSŁUGA WYSYŁANIA ZLECENIA ---
app.post('/add-request-client', (req, res) => {
    const { client, phone, car, vin, service_type, desc } = req.body;
    const sql = "INSERT INTO requests (client, phone, car, vin, service_type, desc) VALUES (?, ?, ?, ?, ?, ?)";
    
    db.run(sql, [client, phone, car, vin, service_type, desc], (err) => {
        if (err) {
            console.error(err.message);
            return res.send("Błąd zapisu w bazie danych.");
        }
        // Przekierowanie z komunikatem
        res.send("<script>alert('Zlecenie zostało przyjęte! Skontaktujemy się z Tobą.'); window.location.href='/';</script>");
    });
});

// --- SKLEP I KOSZYK ---
app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        let cardsHtml = "";
        if (!rows || rows.length === 0) {
            cardsHtml = '<div style="grid-column: 1/-1; text-align:center; padding:50px;"><h3>Obecnie brak części w ofercie.</h3></div>';
        } else {
            cardsHtml = rows.map(p => `
                <div class="product-card">
                    <img src="${p.imgUrl || 'https://via.placeholder.com/300x200?text=Czesc'}" alt="${p.name}">
                    <div class="product-details">
                        <h3>${p.name}</h3>
                        <p class="price">${p.price.toFixed(2)} PLN</p>
                        <p style="font-size:0.85em; color:#666; height:40px; overflow:hidden;">${p.desc || ''}</p>
                        <button class="btn" onclick="addToCart(${p.id}, '${p.name}', ${p.price})">🛒 Dodaj do koszyka</button>
                    </div>
                </div>
            `).join('');
        }
        const html = fs.readFileSync(path.join(publicPath, 'sklep.html'), 'utf8');
        res.send(html.replace('', cardsHtml));
    });
});

app.get('/koszyk', (req, res) => { res.sendFile(path.join(publicPath, 'koszyk.html')); });

// --- ADMIN ---
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
            const rList = reqs.map(r => `
                <div style="background:#fff; padding:15px; border-radius:8px; margin-bottom:10px; border-left:5px solid #1a3c61; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between;">
                        <b>${r.car} (${r.client})</b>
                        <a href="/admin/del-r/${r.id}" style="color:red; text-decoration:none; font-weight:bold;">USUŃ</a>
                    </div>
                    <div style="font-size:0.9em; margin-top:5px;">
                        📞 Tel: ${r.phone} | 🚗 VIN: ${r.vin || 'Brak'} | 🛠 Usługa: ${r.service_type}<br>
                        📝 Opis: ${r.desc}
                    </div>
                </div>
            `).join('');
            
            const pList = prods.map(p => `<li style="padding:5px; border-bottom:1px solid #eee;">${p.name} - ${p.price} zł <a href="/admin/del-p/${p.id}" style="color:red; float:right;">[Usuń]</a></li>`).join('');
            
            res.send(`<html><head><link rel="stylesheet" href="style.css"></head><body class="container">
                <h1>Panel Manager</h1>
                <div style="margin-bottom:20px;"><a href="/logout">Wyloguj</a> | <a href="/">Pokaż stronę</a></div>
                <div style="display:flex; gap:30px;">
                    <div style="flex:1.5;"><h2>Otrzymane Zlecenia</h2>${rList || 'Brak nowych zgłoszeń.'}</div>
                    <div style="flex:1;" class="card">
                        <h2>Dodaj Część</h2>
                        <form action="/admin/add" method="POST">
                            <input name="n" placeholder="Nazwa części" required>
                            <input name="pr" type="number" step="0.01" placeholder="Cena" required>
                            <input name="img" placeholder="URL zdjęcia">
                            <textarea name="d" placeholder="Opis"></textarea>
                            <button class="btn">Dodaj do Sklepu</button>
                        </form>
                        <h3 style="margin-top:20px;">Lista Produktów:</h3>
                        <ul style="list-style:none; padding:0;">${pList}</ul>
                    </div>
                </div>
            </body></html>`);
        });
    });
});

app.post('/admin/add', (req, res) => {
    if(req.session.isAdmin) {
        db.run("INSERT INTO products (name, price, desc, imgUrl) VALUES (?, ?, ?, ?)", [req.body.n, req.body.pr, req.body.d, req.body.img], () => res.redirect('/admin'));
    }
});

app.get('/admin/del-r/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM requests WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/admin/del-p/:id', (req, res) => { if(req.session.isAdmin) db.run("DELETE FROM products WHERE id=?", req.params.id, () => res.redirect('/admin')); });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(process.env.PORT || 3000);
