const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const multer = require('multer'); // DO ZDJĘĆ
const fs = require('fs');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./warsztat.db');

// Konfiguracja zapisu zdjęć
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Tworzenie folderu na zdjęcia jeśli nie istnieje
if (!fs.existsSync('./public/uploads/')) {
    fs.mkdirSync('./public/uploads/', { recursive: true });
}

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, desc TEXT, image TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, car TEXT, vin TEXT, phone TEXT, service_type TEXT, desc TEXT)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'warsztat-klucz', resave: false, saveUninitialized: true }));
const publicPath = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(publicPath));

// --- SKLEP ---
app.get('/sklep', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        const productCards = rows.map(p => `
            <div class="product-card">
                <img src="${p.image ? '/uploads/'+p.image : 'https://via.placeholder.com/150'}" style="width:100%; border-radius:8px;">
                <h3>${p.name}</h3>
                <p class="price">${p.price} PLN</p>
                <p>${p.desc}</p>
                <button class="btn" onclick="addToCart('${p.name}', ${p.price})">🛒 Dodaj do koszyka</button>
            </div>
        `).join('');
        const template = fs.readFileSync(path.join(publicPath, 'sklep.html'), 'utf8');
        res.send(template.replace('', productCards));
    });
});

// --- ADMIN: DODAWANIE ZDJĘĆ ---
app.post('/admin/add-p', upload.single('image'), (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    const { n, pr, d } = req.body;
    const imgName = req.file ? req.file.filename : null;
    db.run("INSERT INTO products (name, price, desc, image) VALUES (?, ?, ?, ?)", [n, pr, d, imgName], () => res.redirect('/admin'));
});

// --- PANEL ADMINA (Zaktualizowany) ---
app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    db.all("SELECT * FROM requests ORDER BY id DESC", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = reqs.map(r => `<div class="req-item"><b>${r.car}</b> - ${r.client} (${r.phone})<br>Type: ${r.service_type}<br>Opis: ${r.desc}</div>`).join('');
            const pList = prods.map(p => `<li>${p.name} - ${p.price} PLN</li>`).join('');
            res.send(`
                <html><head><link rel="stylesheet" href="style.css"></head><body class="container">
                <h1>Panel Admina</h1><a href="/logout">Wyloguj</a>
                <div style="display:flex; gap:20px;">
                    <div style="flex:1"><h2>Zlecenia</h2>${rList}</div>
                    <div style="flex:1" class="card">
                        <h2>Dodaj produkt ze zdjęciem</h2>
                        <form action="/admin/add-p" method="POST" enctype="multipart/form-data">
                            <input name="n" placeholder="Nazwa" required>
                            <input name="pr" type="number" step="0.01" placeholder="Cena" required>
                            <textarea name="d" placeholder="Opis"></textarea>
                            <input type="file" name="image" accept="image/*">
                            <button class="btn">Dodaj Produkt</button>
                        </form>
                        <ul>${pList}</ul>
                    </div>
                </div>
                </body></html>
            `);
        });
    });
});

// Reszta Twoich tras (login, add-request-client, logout)...
app.get('/', (req, res) => { res.sendFile(path.join(publicPath, 'index.html')); });
app.post('/login', (req, res) => {
    if(req.body.u === 'admin' && req.body.p === 'admin123') { req.session.isAdmin = true; res.redirect('/admin'); }
    else res.send("Błąd");
});
app.post('/add-request-client', (req, res) => {
    const { client, car, vin, phone, service_type, desc } = req.body;
    db.run("INSERT INTO requests (client, car, vin, phone, service_type, desc) VALUES (?, ?, ?, ?, ?, ?)", [client, car, vin, phone, service_type, desc], () => res.redirect('/'));
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(process.env.PORT || 3000);
