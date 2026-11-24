-- ============================================================================
-- CineBook database schema + DEVELOPMENT SAMPLE DATA
-- MySQL 8.0+.  Import with: mysql -u root -p < database/cinebook.sql
-- All sample rows below are DEVELOPMENT DATA and can be removed/reset safely.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS cinebook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cinebook;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS seat_reservations;
DROP TABLE IF EXISTS watchlists;
DROP TABLE IF EXISTS coupons;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS booking_seats;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS shows;
DROP TABLE IF EXISTS seats;
DROP TABLE IF EXISTS screens;
DROP TABLE IF EXISTS theatre_owners;
DROP TABLE IF EXISTS theatres;
DROP TABLE IF EXISTS movies;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NULL,
  role ENUM('customer','admin','owner') NOT NULL DEFAULT 'customer',
  city VARCHAR(100) NULL,
  avatar_url VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  reset_token_hash VARCHAR(255) NULL,
  reset_token_expires DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_city (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. movies
-- ---------------------------------------------------------------------------
CREATE TABLE movies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(220) NOT NULL,
  description TEXT NULL,
  genre VARCHAR(255) NOT NULL,
  language VARCHAR(80) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 120,
  release_date DATE NOT NULL,
  poster_url VARCHAR(500) NULL,
  backdrop_url VARCHAR(500) NULL,
  trailer_url VARCHAR(500) NULL,
  rating DECIMAL(3,1) NOT NULL DEFAULT 0.0,
  certification VARCHAR(20) NULL DEFAULT 'UA13+',
  cast_json JSON NULL,
  crew_json JSON NULL,
  status ENUM('upcoming','now_showing','ended','archived') NOT NULL DEFAULT 'now_showing',
  is_trending TINYINT(1) NOT NULL DEFAULT 0,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  is_recommended TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_movies_slug (slug),
  KEY idx_movies_status (status),
  KEY idx_movies_language (language),
  KEY idx_movies_release (release_date),
  KEY idx_movies_rating (rating),
  FULLTEXT KEY ft_movies_search (title, description, genre, language),
  CONSTRAINT fk_movies_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. theatres
-- ---------------------------------------------------------------------------
CREATE TABLE theatres (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id BIGINT UNSIGNED NULL,
  name VARCHAR(180) NOT NULL,
  address VARCHAR(400) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NULL,
  pincode VARCHAR(20) NULL,
  phone VARCHAR(30) NULL,
  facilities JSON NULL,
  logo_url VARCHAR(500) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_theatres_city (city),
  KEY idx_theatres_owner (owner_id),
  KEY idx_theatres_status (status),
  CONSTRAINT fk_theatres_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. theatre_owners
-- ---------------------------------------------------------------------------
CREATE TABLE theatre_owners (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  business_name VARCHAR(180) NULL,
  phone VARCHAR(30) NULL,
  gst_number VARCHAR(50) NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_owner_user (user_id),
  CONSTRAINT fk_owner_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. screens
-- ---------------------------------------------------------------------------
CREATE TABLE screens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  theatre_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  capacity INT NOT NULL DEFAULT 96,
  seat_layout JSON NULL,
  status ENUM('active','maintenance','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_screen_name (theatre_id, name),
  KEY idx_screens_theatre (theatre_id),
  CONSTRAINT fk_screens_theatre FOREIGN KEY (theatre_id) REFERENCES theatres(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. seats
-- ---------------------------------------------------------------------------
CREATE TABLE seats (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  screen_id BIGINT UNSIGNED NOT NULL,
  seat_number VARCHAR(20) NOT NULL,
  row_label VARCHAR(10) NOT NULL,
  seat_type ENUM('silver','gold','premium') NOT NULL DEFAULT 'silver',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seats_number (screen_id, seat_number),
  KEY idx_seats_type (seat_type),
  CONSTRAINT fk_seats_screen FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. shows
-- ---------------------------------------------------------------------------
CREATE TABLE shows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  movie_id BIGINT UNSIGNED NOT NULL,
  screen_id BIGINT UNSIGNED NOT NULL,
  show_date DATE NOT NULL,
  show_time TIME NOT NULL,
  silver_price DECIMAL(10,2) NOT NULL DEFAULT 180.00,
  gold_price DECIMAL(10,2) NOT NULL DEFAULT 260.00,
  premium_price DECIMAL(10,2) NOT NULL DEFAULT 340.00,
  status ENUM('scheduled','cancelled','completed') NOT NULL DEFAULT 'scheduled',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_show_slot (screen_id, show_date, show_time),
  KEY idx_shows_movie_date (movie_id, show_date),
  KEY idx_shows_date (show_date),
  KEY idx_shows_status (status),
  CONSTRAINT fk_shows_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  CONSTRAINT fk_shows_screen FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8. bookings
-- ---------------------------------------------------------------------------
CREATE TABLE bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_ref VARCHAR(30) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  show_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','confirmed','cancelled','refunded') NOT NULL DEFAULT 'pending',
  seats_json JSON NOT NULL,
  seat_count INT NOT NULL DEFAULT 0,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  convenience_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  coupon_code VARCHAR(40) NULL,
  payment_status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  expires_at DATETIME NULL,
  booked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_ref (booking_ref),
  KEY idx_bookings_user (user_id, created_at),
  KEY idx_bookings_show (show_id),
  KEY idx_bookings_status (status),
  KEY idx_bookings_expires (expires_at),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_show FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 9. booking_seats (UNIQUE guarantees a seat is sold at most once per show)
-- ---------------------------------------------------------------------------
CREATE TABLE booking_seats (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  show_id BIGINT UNSIGNED NOT NULL,
  seat_id BIGINT UNSIGNED NOT NULL,
  seat_number VARCHAR(20) NOT NULL,
  seat_type ENUM('silver','gold','premium') NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_booking_seat_once (show_id, seat_id),
  KEY idx_booking_seats_booking (booking_id),
  CONSTRAINT fk_bs_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_bs_show FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bs_seat FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS trg_booking_seats_validate;
DELIMITER //
CREATE TRIGGER trg_booking_seats_validate BEFORE INSERT ON booking_seats
FOR EACH ROW
BEGIN
  DECLARE v_screen BIGINT UNSIGNED;
  DECLARE v_booking_show BIGINT UNSIGNED;
  DECLARE v_seat_active TINYINT DEFAULT 0;
  SELECT screen_id INTO v_screen FROM shows WHERE id = NEW.show_id;
  SELECT show_id INTO v_booking_show FROM bookings WHERE id = NEW.booking_id;
  SELECT is_active INTO v_seat_active FROM seats WHERE id = NEW.seat_id;
  IF v_screen IS NULL OR v_booking_show <> NEW.show_id OR v_seat_active <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid seat or booking for this show';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM seats WHERE id = NEW.seat_id AND screen_id = v_screen) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seat does not belong to this show screen';
  END IF;
END//
DELIMITER ;

-- ---------------------------------------------------------------------------
-- 10. payments
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  razorpay_order_id VARCHAR(120) NULL,
  razorpay_payment_id VARCHAR(120) NULL,
  razorpay_signature VARCHAR(255) NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status ENUM('created','authorized','paid','failed','refunded') NOT NULL DEFAULT 'created',
  method VARCHAR(50) NULL,
  failure_reason TEXT NULL,
  refund_id VARCHAR(120) NULL,
  refund_status VARCHAR(50) NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_order (razorpay_order_id),
  KEY idx_payments_booking (booking_id),
  KEY idx_payments_status (status),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 11. reviews
-- ---------------------------------------------------------------------------
CREATE TABLE reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  movie_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT NOT NULL,
  comment TEXT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_review_once (user_id, movie_id),
  KEY idx_reviews_movie (movie_id),
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 12. coupons
-- ---------------------------------------------------------------------------
CREATE TABLE coupons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  description VARCHAR(255) NULL,
  discount_type ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
  discount_value DECIMAL(10,2) NOT NULL,
  min_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_discount DECIMAL(10,2) NULL,
  usage_limit INT NULL,
  used_count INT NOT NULL DEFAULT 0,
  valid_from DATETIME NULL,
  valid_until DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupons_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 13. watchlists
-- ---------------------------------------------------------------------------
CREATE TABLE watchlists (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  movie_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_watchlist (user_id, movie_id),
  CONSTRAINT fk_watchlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_watchlist_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 14. seat_reservations (short-lived holds during checkout)
-- ---------------------------------------------------------------------------
CREATE TABLE seat_reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  show_id BIGINT UNSIGNED NOT NULL,
  seat_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  session_id VARCHAR(120) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reservation_seat (show_id, seat_id),
  KEY idx_reservations_expiry (expires_at),
  KEY idx_reservations_session (session_id),
  CONSTRAINT fk_res_show FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_seat FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS trg_reservations_validate;
DELIMITER //
CREATE TRIGGER trg_reservations_validate BEFORE INSERT ON seat_reservations
FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM seats s JOIN shows sh ON sh.screen_id = s.screen_id
    WHERE s.id = NEW.seat_id AND sh.id = NEW.show_id AND s.is_active = 1
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seat does not belong to this show screen';
  END IF;
END//
DELIMITER ;

-- ===========================================================================
-- DEVELOPMENT DATA (safe to delete; admin UI can manage all of it)
-- Demo accounts use password: Demo@123  (bcrypt hashes generated for seeding)
-- ===========================================================================
INSERT INTO users (id, name, email, password_hash, phone, role, city, is_active) VALUES
 (1, 'Aarav Admin', 'admin@cinebook.dev', '$2a$10$YgScWJONSzmGNm7uDEobWO4f/E9SDSCFUJglw25O7l5tNeLzudKWW', '9000000001', 'admin', 'Chennai', 1),
 (2, 'Meera Owner', 'owner@cinebook.dev', '$2a$10$PO2TmD6cJtiOlZdSWVugVu1ts4FUc8hi5uXcP46FublYn4h.qU1Ue', '9000000002', 'owner', 'Chennai', 1),
 (3, 'Vijay Customer', 'demo@cinebook.dev', '$2a$10$sfzt/aGrAvdN2rL/f9GXwuUsiGGDsS8RqhSNlwSw0E9Rc8EgHaTCK', '9000000003', 'customer', 'Chennai', 1),
 (4, 'Ananya Iyer', 'ananya@example.com', '$2a$10$sfzt/aGrAvdN2rL/f9GXwuUsiGGDsS8RqhSNlwSw0E9Rc8EgHaTCK', '9000000004', 'customer', 'Mumbai', 1),
 (5, 'Rohan Rao', 'rohan@example.com', '$2a$10$sfzt/aGrAvdN2rL/f9GXwuUsiGGDsS8RqhSNlwSw0E9Rc8EgHaTCK', '9000000005', 'customer', 'Bengaluru', 1);
ALTER TABLE users AUTO_INCREMENT = 6;

INSERT INTO theatre_owners (user_id, business_name, phone, is_verified) VALUES
 (2, 'Meera Cinemas Pvt Ltd', '9000000002', 1);

INSERT INTO movies (id, title, slug, description, genre, language, duration_minutes, release_date, poster_url, backdrop_url, trailer_url, rating, certification, cast_json, crew_json, status, is_trending, is_featured, is_recommended, created_by) VALUES
 (1,'Leo','leo','A fiery, action-packed tale of a café owner whose hidden past resurfaces, forcing him to protect the people he loves.','Action, Thriller','Tamil',164,'2023-10-19','/posters/leo.svg','/backdrops/action.svg','https://www.youtube.com/watch?v=6aV-tJxUwoQ',8.6,'UA16+',JSON_ARRAY('Vijay','Trisha','Gautham Menon'),JSON_OBJECT('director','Lokesh Kanagaraj','music','Anirudh Ravichander'),'now_showing',1,1,1,1),
 (2,'Jailer','jailer','A retired jailer is pulled back into the underworld when his son is falsely accused, unleashing a calculated revenge.','Action, Drama','Tamil',161,'2023-08-10','/posters/jailer.svg','/backdrops/action.svg','https://www.youtube.com/watch?v=RS8B6onbz4k',8.4,'UA16+',JSON_ARRAY('Rajinikanth','Ramya Krishnan','Vasundhara Kashyap'),JSON_OBJECT('director','Nelson Dilipkumar','music','Anirudh Ravichander'),'now_showing',1,1,1,1),
 (3,'Vikram','vikram','A tactical squad races against time to stop a mysterious gang before their next high-profile strike.','Action, Thriller','Tamil',173,'2022-06-03','/posters/vikram.svg','/backdrops/action.svg','https://www.youtube.com/watch?v=IR0t0lN-4dA',8.3,'UA16+',JSON_ARRAY('Kamal Haasan','Vijay Sethupathi','Fahadh Faasil'),JSON_OBJECT('director','Lokesh Kanagaraj','music','Anirudh Ravichander'),'now_showing',0,0,1,1),
 (4,'Master','master','An alcoholic professor takes on a dangerous street gang, uncovering a much larger conspiracy in the process.','Action, Drama','Tamil',179,'2021-01-13','/posters/master.svg','/backdrops/action.svg','https://www.youtube.com/watch?v=QyP5z7o8F8Q',8.1,'UA16+',JSON_ARRAY('Vijay','Vijay Sethupathi','Malavika Mohanan'),JSON_OBJECT('director','Lokesh Kanagaraj','music','Anirudh Ravichander'),'now_showing',0,0,0,1),
 (5,'Interstellar','interstellar','Explorers travel through a wormhole in search of a new home for humanity, confronting the limits of time and love.','Sci-Fi, Adventure','English',169,'2014-11-07','/posters/interstellar.svg','/backdrops/scifi.svg','https://www.youtube.com/watch?v=zSWdZVtXT7E',8.7,'UA13+',JSON_ARRAY('Matthew McConaughey','Anne Hathaway','Jessica Chastain'),JSON_OBJECT('director','Christopher Nolan','music','Hans Zimmer'),'now_showing',1,1,1,1),
 (6,'Inception','inception','A skilled thief who steals secrets through dream-sharing technology is offered a chance at redemption.','Sci-Fi, Thriller','English',148,'2010-07-16','/posters/inception.svg','/backdrops/scifi.svg','https://www.youtube.com/watch?v=YoHD9XEInc0',8.8,'UA13+',JSON_ARRAY('Leonardo DiCaprio','Joseph Gordon-Levitt','Elliot Page'),JSON_OBJECT('director','Christopher Nolan','music','Hans Zimmer'),'now_showing',0,0,1,1),
 (7,'Avatar','avatar','A marine on an alien moon becomes caught between his own species and the Na''vi, fighting for the future of Pandora.','Sci-Fi, Fantasy','English',162,'2009-12-18','/posters/avatar.svg','/backdrops/scifi.svg','https://www.youtube.com/watch?v=5PSNL1qE6VY',8.0,'UA13+',JSON_ARRAY('Sam Worthington','Zoe Saldana','Sigourney Weaver'),JSON_OBJECT('director','James Cameron','music','James Horner'),'now_showing',0,0,0,1),
 (8,'Avengers: Endgame','avengers-endgame','The remaining Avengers make a final stand to reverse the decimation and restore balance to the universe.','Action, Sci-Fi','English',181,'2019-04-26','/posters/avengers-endgame.svg','/backdrops/action.svg','https://www.youtube.com/watch?v=TcMBFSGVi1c',8.5,'UA13+',JSON_ARRAY('Robert Downey Jr.','Chris Evans','Mark Ruffalo'),JSON_OBJECT('director','Anthony Russo, Joe Russo','music','Alan Silvestri'),'now_showing',1,0,1,1);
ALTER TABLE movies AUTO_INCREMENT = 9;

INSERT INTO theatres (id, owner_id, name, address, city, state, pincode, phone, facilities, logo_url, status) VALUES
 (1,2,'PVR: Phoenix Marketcity','Phoenix Marketcity, Velachery Main Road','Chennai','Tamil Nadu','600042','044-45678901',JSON_ARRAY('M-Ticket','Food & Beverage','Parking','Recliner','Dolby Atmos'),'/theatres/pvr.svg','active'),
 (2,2,'INOX: Express Avenue','Express Avenue Mall, Whites Road','Chennai','Tamil Nadu','600014','044-45678902',JSON_ARRAY('M-Ticket','Food & Beverage','Parking','4DX'),'/theatres/inox.svg','active'),
 (3,2,'AGS: KRP Purasawalkam','KRP Tower, Purasawalkam High Road','Chennai','Tamil Nadu','600007','044-45678903',JSON_ARRAY('M-Ticket','Parking','Wheelchair Access'),'/theatres/ags.svg','active'),
 (4,2,'PVR: Jio World Drive','Jio World Drive, Bandra Kurla Complex','Mumbai','Maharashtra','400051','022-45678904',JSON_ARRAY('M-Ticket','Food & Beverage','Parking','IMAX'),'/theatres/pvr.svg','active'),
 (5,2,'INOX: Garuda Mall','Garuda Mall, Magrath Road','Bengaluru','Karnataka','560025','080-45678905',JSON_ARRAY('M-Ticket','Food & Beverage','Parking'),'/theatres/inox.svg','active'),
 (6,2,'PVR: Saket','DLF South Court, Saket','New Delhi','Delhi','110017','011-45678906',JSON_ARRAY('M-Ticket','Food & Beverage','Parking','Dolby Atmos'),'/theatres/pvr.svg','active');
ALTER TABLE theatres AUTO_INCREMENT = 7;

INSERT INTO screens (id, theatre_id, name, capacity, seat_layout, status) VALUES
 (1,1,'Screen 1',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active'),
 (2,1,'Screen 2',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active'),
 (3,2,'Screen 1',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active'),
 (4,2,'Screen 2',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active'),
 (5,3,'Screen 1',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active'),
 (6,3,'Screen 2',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active'),
 (7,4,'Screen 1',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active'),
 (8,4,'Screen 2',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active'),
 (9,5,'Screen 1',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active'),
 (10,5,'Screen 2',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active'),
 (11,6,'Screen 1',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active'),
 (12,6,'Screen 2',96,JSON_OBJECT('rows',8,'columns',12,'aisleAfter',6),'active');
ALTER TABLE screens AUTO_INCREMENT = 13;

-- 96 seats per screen (rows A-H, seats 1-12; A-B Silver, C-E Gold, F-H Premium)
INSERT INTO seats (screen_id, seat_number, row_label, seat_type)
WITH RECURSIVE row_seq AS (
  SELECT 1 AS n UNION ALL SELECT n + 1 FROM row_seq WHERE n < 8
), col_seq AS (
  SELECT 1 AS n UNION ALL SELECT n + 1 FROM col_seq WHERE n < 12
)
SELECT sc.id, CONCAT(CHAR(64 + r.n), c.n), CHAR(64 + r.n),
       CASE WHEN r.n <= 2 THEN 'silver' WHEN r.n <= 5 THEN 'gold' ELSE 'premium' END
FROM screens sc
CROSS JOIN row_seq r
CROSS JOIN col_seq c;

-- 14 days of shows, 4 slots per screen, rotating movies
INSERT INTO shows (movie_id, screen_id, show_date, show_time, silver_price, gold_price, premium_price)
WITH RECURSIVE date_seq AS (
  SELECT CURDATE() AS d UNION ALL SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM date_seq WHERE d < DATE_ADD(CURDATE(), INTERVAL 13 DAY)
), slot_seq AS (
  SELECT 1 AS n UNION ALL SELECT n + 1 FROM slot_seq WHERE n < 4
)
SELECT
  ((sc.id + DAYOFYEAR(ds.d) + sl.n - 2) MOD 8) + 1,
  sc.id,
  ds.d,
  CASE sl.n WHEN 1 THEN '10:30:00' WHEN 2 THEN '13:45:00' WHEN 3 THEN '17:15:00' ELSE '21:00:00' END,
  180.00, 260.00, 340.00
FROM screens sc
CROSS JOIN date_seq ds
CROSS JOIN slot_seq sl;

INSERT INTO coupons (code, description, discount_type, discount_value, min_amount, max_discount, usage_limit, valid_from, valid_until, is_active) VALUES
 ('CINE100','Flat ₹100 off on bookings above ₹500','fixed',100.00,500.00,NULL,500,DATE_SUB(NOW(), INTERVAL 1 DAY),DATE_ADD(NOW(), INTERVAL 365 DAY),1),
 ('FIRST20','20% off up to ₹150 for first bookings','percent',20.00,200.00,150.00,1000,DATE_SUB(NOW(), INTERVAL 1 DAY),DATE_ADD(NOW(), INTERVAL 365 DAY),1),
 ('WEEKEND15','15% weekend special','percent',15.00,300.00,120.00,250,DATE_SUB(NOW(), INTERVAL 1 DAY),DATE_ADD(NOW(), INTERVAL 365 DAY),1);

INSERT INTO reviews (user_id, movie_id, rating, comment, status) VALUES
 (3,1,5,'Absolutely electrifying. The second half is pure theatre magic!','approved'),
 (4,5,5,'A masterpiece. Watched in IMAX and it was unforgettable.','approved'),
 (5,6,4,'Still the most clever thriller I have ever seen.','approved'),
 (3,8,5,'Perfect farewell to the Avengers.','approved');

INSERT INTO watchlists (user_id, movie_id) VALUES (3,5),(3,6),(3,8),(4,1),(5,2);

SELECT 'CineBook schema and development sample data installed successfully' AS message;
