const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./ekspedisi.db');

db.all("SELECT * FROM shipments", [], (err, rows) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log(`Found ${rows.length} shipments.`);
        rows.forEach((row) => {
            console.log(`${row.id}: ${row.tracking_number} - ${row.sender_name}`);
        });
    }
    db.close();
});
