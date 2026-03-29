const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'webloc'
    });

    const sqlPath = path.join(__dirname, 'sql', 'alterations', '20260112_add_custom_image_to_games.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await conn.query(sql);
    console.log('✅ Migração executada com sucesso');
    
    await conn.end();
  } catch (err) {
    console.error('❌ Erro ao executar migração:', err.message);
    process.exit(1);
  }
})();
