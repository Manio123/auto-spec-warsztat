const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./warsztat.db');

// --- INICJALIZACJA BAZY ---
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, car TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ 
    secret: 'auto-spec-secret-key', 
    resave: false, 
    saveUninitialized: true 
}));

// Wykrywanie folderu public (dla Render)
const publicPath = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(publicPath));

// --- TRASY DLA UŻYTKOWNIKA ---

// Strona Główna
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Sklep (Dynamiczne wyświetlanie produktów)
app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        const productCards = rows.map(p => `
            <div class="product-card" style="border:1px solid #ccc; padding:15px; margin:10px; border-radius:8px;">
                <h3>${p.name}</h3>
                <p><b>Cena: ${p.price} PLN</b></p>
                <p>${p.desc}</p>
                <button class="btn">Kup teraz</button>
            </div>
        `).join('');
        
        const sklepTemplate = path.join(publicPath, 'sklep.html');
        if (fs.existsSync(sklepTemplate)) {
            let html = fs.readFileSync(sklepTemplate, 'utf8');
            res.send(html.replace('', productCards || '<p>Obecnie brak produktów w sklepie.</p>'));
        } else {
            res.send("<h1>Sklep</h1><div style='display:flex; flex-wrap:wrap;'>" + productCards + "</div>");
        }
    });
});

// --- PANEL ADMINA ---

app.get('/login', (req, res) => {
    res.send(`
        <html><head><link rel="stylesheet" href="style.css"></head>
        <body style="display:flex; justify-content:center; align-items:center; height:100vh; background:#f4f4f4;">
            <div style="background:white; padding:30px; border-radius:10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                <h2>Logowanie Admina</h2>
                <form action="/login" method="POST">
                    <input name="u" placeholder="Login" required style="display:block; width:100%; margin-bottom:10px; padding:10px;">
                    <input type="password" name="p" placeholder="Hasło" required style="display:block; width:100%; margin-bottom:10px; padding:10px;">
                    <button type="submit" style="width:100%; padding:10px; background:#007bff; color:white; border:none; cursor:pointer;">Zaloguj</button>
                </form>
            </div>
        </body></html>
    `);
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else {
        res.send("Błędny login lub hasło! <a href='/login'>Spróbuj ponownie</a>");
    }
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    
    db.all("SELECT * FROM requests", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = reqs.map(r => `<li>🚗 <b>${r.car}</b> - ${r.client} <br> <small>${r.desc}</small></li>`).join('');
            const pList = prods.map(p => `<li>📦 ${p.name} - ${p.price} PLN</li>`).join('');

            res.send(`
                <html><head><link rel="stylesheet" href="style.css"></head>
                <body style="padding:40px; font-family:Arial;">
                    <h1>🛠 Zarządzanie Warsztatem</h1>
                    <a href="/logout" style="color:red; text-decoration:none; font-weight:bold;">[ Wyloguj się ]</a> | <a href="/">Powrót do strony</a>
                    <hr>
                    <div style="display:flex; gap:50px; margin-top:20px;">
                        <div style="flex:1; background:#eee; padding:20px; border-radius:10px;">
                            <h2>Dodaj produkt do sklepu</h2>
                            <form action="/admin/add-product" method="POST">
                                <input name="name" placeholder="Nazwa części" required style="width:100%; margin-bottom:10px; padding:8px;">
                                <input name="price" type="number" step="0.01" placeholder="Cena" required style="width:100%; margin-bottom:10px; padding:8px;">
                                <textarea name="desc" placeholder="Opis produktu" style="width:100%; height:80px; margin-bottom:10px; padding:8px;"></textarea>
                                <button type="submit" style="background:green; color:white; border:none; padding:10px 20px; cursor:pointer;">Dodaj produkt</button>
                            </form>
                            <h3>Produkty:</h3><ul>${pList || 'Brak'}</ul>
                        </div>
                        <div style="flex:1; background:#e3f2fd; padding:20px; border-radius:10px;">
                            <h2>Zlecenia naprawy</h2>
                            <form action="/admin/add-request" method="POST">
                                <input name="client" placeholder="Klient" required style="width:100%; margin-bottom:10px; padding:8px;">
                                <input name="car" placeholder="Auto" required style="width:100%; margin-bottom:10px; padding:8px;">
                                <textarea name="desc" placeholder="Opis usterki" style="width:100%; height:80px; margin-bottom:10px; padding:8px;"></textarea>
                                <button type="submit" style="background:#007bff; color:white; border:none; padding:10px 20px; cursor:pointer;">Dodaj zlecenie</button>
                            </form>
                            <h3>Oczekujące naprawy:</h3><ul>${rList || 'Brak'}</ul>
                        </div>
                    </div>
                </body></html>
            `);
        });
    });
});

app.post('/admin/add-product', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    const { name, price, desc } = req.body;
    db.run("INSERT INTO products (name, price, desc) VALUES (?, ?, ?)", [name, price, desc], () => res.redirect('/admin'));
});

app.post('/admin/add-request', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    const { client, car, desc } = req.body;
    db.run("INSERT INTO requests (client, car, desc) VALUES (?, ?, ?)", [client, car, desc], () => res.redirect('/admin'));
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Start serwera na portach Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serwer śmiga na porcie ${PORT}`));
