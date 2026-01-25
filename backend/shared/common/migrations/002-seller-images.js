/**
 * Migration 002: Add seller_images table for storing ID verification images
 */

export const up = (db) => {
  // Create seller_images table
  db.exec(`
    CREATE TABLE IF NOT EXISTS seller_images (
      image_id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      image_type TEXT NOT NULL,
      image_data TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seller_id) REFERENCES sellers(seller_id)
    )
  `);
  
  db.exec(`CREATE INDEX IF NOT EXISTS idx_seller_images_seller ON seller_images(seller_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_seller_images_type ON seller_images(image_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_seller_images_created ON seller_images(created_at)`);

  console.log('Migration 002-seller-images applied successfully');
};

export const down = (db) => {
  db.exec(`DROP TABLE IF EXISTS seller_images`);
  console.log('Migration 002-seller-images rolled back');
};

export default { up, down };

