CREATE DATABASE aptech_db;

USE aptech_db;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  password VARCHAR(100) NOT NULL,
  role ENUM('teacher','student') NOT NULL
);

INSERT INTO users (name, password, role)
VALUES 
('Alice Teacher','teacher123','teacher'),
('Bob Student','student123','student');
