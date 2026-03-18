// --- PANEL ADMINA Z MOŻLIWOŚCIĄ DODAWANIA ---

app.get('/admin', (req, res) => {
    if(!req.session.isAdmin) return res.redirect('/login');
    
    db.all("SELECT * FROM requests", (err, reqs) => {
        db.all("SELECT * FROM products", (err, prods) => {
            const rList = reqs.map(r => `<li>🚗 <b>${r.car}</b> - Klient: ${r.client} <br> <i>${r.desc}</i></li>`).join('');
            const pList = prods.map(p => `<li>📦 ${p.name} - ${p.price} PLN</li>`).join('');

            res.send(`
                <html>
                <head><link rel="stylesheet" href="style.css"></head>
                <body style="padding:20px; font-family: sans-serif;">
                    <h1>🛠 Panel Zarządzania Warsztatem</h1>
                    <a href="/logout" style="color:red">Wyloguj się</a>
                    <hr>

                    <div style="display: flex; gap: 40px;">
                        <div class="product-card" style="flex: 1;">
                            <h2>Dodaj produkt do sklepu</h2>
                            <form action="/admin/add-product" method="POST">
                                <input name="name" placeholder="Nazwa części" required><br><br>
                                <input name="price" type="number" step="0.01" placeholder="Cena (PLN)" required><br><br>
                                <textarea name="desc" placeholder="Opis..."></textarea><br><br>
                                <button class="btn" type="submit">Dodaj do sklepu</button>
                            </form>
                            <h3>Aktualny asortyment:</h3>
                            <ul>${pList || 'Brak produktów'}</ul>
                        </div>

                        <div class="product-card" style="flex: 1;">
                            <h2>Zlecenia i Zgłoszenia</h2>
                            <form action="/admin/add-request" method="POST">
                                <input name="client" placeholder="Imię i nazwisko" required><br><br>
                                <input name="car" placeholder="Model auta" required><br><br>
                                <textarea name="desc" placeholder="Co jest do naprawy?"></textarea><br><br>
                                <button class="btn" type="submit" style="background:#28a745">Dodaj zlecenie ręcznie</button>
                            </form>
                            <h3>Lista do zrobienia:</h3>
                            <ul>${rList || 'Brak zgłoszeń'}</ul>
                        </div>
                    </div>
                </body>
                </html>
            `);
        });
    });
});

// --- OBSŁUGA FORMULARZY (LOGIKA BAZY) ---

// Dodawanie produktu
app.post('/admin/add-product', (req, res) => {
    if(!req.session.isAdmin) return res.status(403).send('Brak dostępu');
    const { name, price, desc } = req.body;
    db.run("INSERT INTO products (name, price, desc) VALUES (?, ?, ?)", [name, price, desc], (err) => {
        res.redirect('/admin'); // Odśwież panel po dodaniu
    });
});

// Dodawanie zgłoszenia
app.post('/admin/add-request', (req, res) => {
    if(!req.session.isAdmin) return res.status(403).send('Brak dostępu');
    const { client, car, desc } = req.body;
    db.run("INSERT INTO requests (client, car, desc) VALUES (?, ?, ?)", [client, car, desc], (err) => {
        res.redirect('/admin'); // Odśwież panel po dodaniu
    });
});
