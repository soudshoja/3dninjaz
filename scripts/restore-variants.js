const mysql = require('mysql2/promise');

const dbConfig = {
  host: '152.53.86.223',
  port: 3306,
  user: 'ninjaz_3dn',
  password: 'UHZ6G1DmU6UkqCV9TmAkne7Y',
  database: 'ninjaz_3dn',
};

async function checkVariants(productId) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database');

    // Check current variants
    const [variants] = await connection.execute(
      'SELECT id, option1ValueId, option2ValueId, option3ValueId, option4ValueId, option5ValueId, option6ValueId, price, stock, inStock, sku, imageUrl, position, costPrice, filamentGrams, printTimeHours, laborMinutes, otherCost, filamentRateOverride, laborRateOverride, costPriceManual, salePrice, saleFrom, saleTo, isDefault, labelCache, trackStock, weightG, allowPreorder FROM productVariants WHERE productId = ? ORDER BY position',
      [productId]
    );

    console.log(`Found ${variants.length} variants for product ${productId}`);
    if (variants.length > 0) {
      console.log('\nCurrent variants:');
      variants.forEach(v => {
        console.log(`  - id: ${v.id}, price: ${v.price}, stock: ${v.stock}, inStock: ${v.inStock}`);
        console.log(`    option1: ${v.option1ValueId}, option2: ${v.option2ValueId}, option3: ${v.option3ValueId}`);
        console.log(`    label: ${v.labelCache || '(no label)'}`);
      });
    } else {
      console.log('No variants found - data may have been deleted');
    }

    // Check options
    const [options] = await connection.execute(
      'SELECT id, name, position FROM productOptions WHERE productId = ?',
      [productId]
    );
    console.log(`\nFound ${options.length} options`);

    // Check option values
    const [values] = await connection.execute(
      'SELECT id, optionId, value, position FROM productOptionValues WHERE optionId IN (SELECT id FROM productOptions WHERE productId = ?)',
      [productId]
    );
    console.log(`Found ${values.length} option values`);

    // Check if there's a localStorage autosave draft
    console.log('\n--- Checking localStorage autosave (if any stored in DB) ---');
    const [drafts] = await connection.execute(
      "SELECT * FROM information_schema.tables WHERE table_schema = 'ninjaz_3dn' AND table_name LIKE '%draft%'",
      []
    );
    console.log('No localStorage table - autosave was client-side only');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

// Product ID from the user
const productId = '5f52e087-6aa6-43a0-a4c8-56a98cdccb68';
checkVariants(productId);
