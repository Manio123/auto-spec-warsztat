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
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, car TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'auto-spec-2026', resave: false, saveUninitialized: true }));

// --- AUTOMATYCZNE WYKRYWANIE ŚCIEŻKI ---
// Sprawdzamy czy pliki są w folderze public czy w głównym
const publicPath = fs.existsSync(path.join(__dirname, 'public')) 
    ? path.join(__dirname, 'public') 
    : __dirname;

app.use(express.static(publicPath));

app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // Jeśli nie znajdzie pliku, wypisze listę plików na ekranie, żebyśmy wiedzieli co jest źle
        const files = fs.readdirSync(__dirname);
        res.status(404).send(`Błąd: Nie znaleziono index.html. Widoczne pliki: ${files.join(', ')}`);
    }
});

app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        const productCards = rows.map(p => `
            <div class="product-card">
                <h3>${p.name}</h3>
                <p>${p.price} PLN</p>
                <button class="btn">Kup teraz</button>
            </div>
        `).join('');
        
        const sklepPath = path.join(publicPath, 'sklep.html');
        if (fs.existsSync(sklepPath)) {
            let html = fs.readFileSync(sklepPath, 'utf8');
            res.send(html.replace('', productCards || '<p>Brak produktów.</p>'));
        } else {
            res.status(404).send("Błąd: Brak pliku sklep.html");
        }
    });
});

// Pozostałe trasy (Login/Admin) zostawiam bez zmian...
app.get('/login', (req, res) => {
    res.send('<html><head><link rel="stylesheet" href="style.css"></head><body><div class="container" style="max-width:400px;margin-top:100px;"><div class="product-card"><h2>Logowanie Admin</h2><form action="/login" method="POST"><input name="u" placeholder="Login"><input type="password" name="p" placeholder="Hasło"><button class="btn">Zaloguj</button></form></div></div></body></html>');
});

app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else { res.send('Błąd logowania!'); }
});

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = reqs.map(r => `<li>${r.client}: ${r.car}</li>`).join('');
            res.send(`<h2>Panel Admina</h2><ul>${rList}</ul><a href="/logout">Wyloguj</a>`);
        });
    });
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// Port dla Render
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Serwer działa na porcie ${port}`));
