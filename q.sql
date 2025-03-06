CREATE KEYSPACE entreprise
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 3};
CREATE TABLE entreprise.employes (
id UUID PRIMARY KEY,
nom TEXT,
poste TEXT,
salaire DECIMAL
);
INSERT INTO entreprise.employes (id, nom, poste, salaire)
VALUES (uuid(), 'Ali', 'Développeur', 5000)
USING TTL 86400; -- Donnée supprimée après 24h

-- Créer une table 
CREATE TABLE users (
user_id UUID PRIMARY KEY,
name TEXT,
email TEXT
);
-- Insérer des données 
INSERT INTO users (user_id, name, email)
VALUES (uuid(), 'Alice', 'alice@example.com');


-- Créer un keyspace pour ecommerce
CREATE KEYSPACE ecommerce WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 3};

-- Créer une table pour les produits
CREATE TABLE products (
    product_id UUID PRIMARY KEY,
    name TEXT,
    price DECIMAL
);



-- Insérer des données
INSERT INTO products (product_id, name, price) VALUES (uuid(), 'Smartphone', 699.99);

-- Sélectionner des données
SELECT * FROM products WHERE name = 'Smartphone';




-- Créer un index sur la colonne 'likes'
CREATE INDEX ON posts (likes);

-- Requête filtrée
SELECT * FROM posts WHERE likes > 5;