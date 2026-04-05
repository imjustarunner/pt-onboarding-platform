-- Summit Stats Team Challenge: Club Store
-- Each Club (organization_type = affiliation) has its own store. Products can be points or cash.

-- club_store_products: Products in a club's store
CREATE TABLE IF NOT EXISTS club_store_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL COMMENT 'Club (agencies.id where organization_type=affiliation)',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  price_points INT NULL COMMENT 'Price in season points (optional)',
  price_cents INT NULL COMMENT 'Price in cents (optional)',
  image_path VARCHAR(1024) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_club_store_products_org (organization_id),
  INDEX idx_club_store_products_active (organization_id, is_active),
  CONSTRAINT fk_club_store_products_org
    FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE CASCADE
);

-- club_store_orders: Orders placed in a club store
CREATE TABLE IF NOT EXISTS club_store_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL COMMENT 'Club',
  user_id INT NOT NULL COMMENT 'Purchaser',
  status ENUM('pending', 'paid', 'fulfilled', 'cancelled') NOT NULL DEFAULT 'pending',
  total_points INT NULL COMMENT 'Total points used',
  total_cents INT NULL COMMENT 'Total cash in cents',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_club_store_orders_org (organization_id),
  INDEX idx_club_store_orders_user (user_id),
  INDEX idx_club_store_orders_status (organization_id, status),
  CONSTRAINT fk_club_store_orders_org
    FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_club_store_orders_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- club_store_order_items: Line items in an order
CREATE TABLE IF NOT EXISTS club_store_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  price_points INT NULL COMMENT 'Price per unit at time of purchase',
  price_cents INT NULL COMMENT 'Price per unit at time of purchase',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES club_store_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id) REFERENCES club_store_products(id) ON DELETE RESTRICT
);
