# Référence des Requêtes de Base de Données Cassandra

Ce document fournit une référence complète de toutes les requêtes en langage CQL (Cassandra Query Language) utilisées dans le backend de l'application Food Menu. Ces requêtes démontrent la communication directe avec Cassandra sans utiliser d'ORM.

## Opérations de Schéma

### Création de Keyspace

```cql
CREATE KEYSPACE IF NOT EXISTS food_menu 
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};
```

Le keyspace est créé avec:
- Stratégie de réplication `SimpleStrategy` pour les déploiements à un seul centre de données
- `replication_factor` de 1 (chaque donnée est stockée sur un seul nœud)

Pour la production, modifiez cela en:

```cql
CREATE KEYSPACE IF NOT EXISTS food_menu 
WITH replication = {
  'class': 'NetworkTopologyStrategy', 
  'datacenter1': 3
};
```

### Création de Table

```cql
CREATE TABLE IF NOT EXISTS food_menu.menu_items (
  id uuid PRIMARY KEY,
  name text,
  description text,
  category text,
  price decimal,
  is_vegetarian boolean,
  created_at timestamp,
  updated_at timestamp
);
```

Cela crée une table avec:
- `id` comme clé primaire (clé de partition)
- Diverses colonnes pour les attributs des articles du menu
- Champs d'horodatage pour suivre la création et les mises à jour

## Opérations CRUD

### Opération de Création (Insertion)

```cql
INSERT INTO food_menu.menu_items 
(id, name, description, category, price, is_vegetarian, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);
```

Implémentation JavaScript:
```javascript
const id = cassandra.types.Uuid.random();
const now = new Date();
const query = `
  INSERT INTO menu_items 
  (id, name, description, category, price, is_vegetarian, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

await client.execute(query, [
  id, name, description, category, 
  parseFloat(price), isVegetarian, now, now
], { prepare: true });
```

### Opérations de Lecture

#### Récupérer Tous les Articles du Menu

```cql
SELECT * FROM food_menu.menu_items;
```

Implémentation JavaScript:
```javascript
const query = 'SELECT * FROM menu_items';
const result = await client.execute(query, [], { prepare: true });
const items = result.rows;
```

#### Récupérer un Article du Menu par ID

```cql
SELECT * FROM food_menu.menu_items WHERE id = ?;
```

Implémentation JavaScript:
```javascript
const uuid = cassandra.types.Uuid.fromString(id);
const query = 'SELECT * FROM menu_items WHERE id = ?';
const result = await client.execute(query, [uuid], { prepare: true });
```

### Opération de Mise à Jour

```cql
UPDATE food_menu.menu_items 
SET name = ?, description = ?, category = ?, price = ?, 
    is_vegetarian = ?, updated_at = ?
WHERE id = ?;
```

Implémentation JavaScript:
```javascript
const uuid = cassandra.types.Uuid.fromString(id);
const now = new Date();
const query = `
  UPDATE menu_items 
  SET name = ?, description = ?, category = ?, 
      price = ?, is_vegetarian = ?, updated_at = ?
  WHERE id = ?
`;

await client.execute(query, [
  name, description, category, parseFloat(price), 
  isVegetarian, now, uuid
], { prepare: true });
```

### Opération de Suppression

```cql
DELETE FROM food_menu.menu_items WHERE id = ?;
```

Implémentation JavaScript:
```javascript
const uuid = cassandra.types.Uuid.fromString(id);
const query = 'DELETE FROM menu_items WHERE id = ?';
await client.execute(query, [uuid], { prepare: true });
```

## Requêtes Avancées

### Limitation des Résultats

```cql
SELECT * FROM food_menu.menu_items LIMIT 10;
```

### Autorisation du Filtrage

```cql
SELECT * FROM food_menu.menu_items 
WHERE category = 'Appetizer' ALLOW FILTERING;
```

**Remarque**: ALLOW FILTERING peut être inefficace pour les grands ensembles de données.

### Utilisation de Time-to-Live (TTL)

```cql
INSERT INTO food_menu.menu_items 
(id, name, description, category, price, is_vegetarian, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?) USING TTL 86400;
```

Cela ferait expirer l'enregistrement après 24 heures (86400 secondes).

## Gestion des Paramètres de Requête

Toutes les requêtes de l'application utilisent des instructions paramétrées pour la sécurité et les performances:

```javascript
// Requête paramétrée
const query = 'SELECT * FROM menu_items WHERE id = ?';
const params = [uuid];
const result = await client.execute(query, params, { prepare: true });
```

Avantages:
- Prévient l'injection CQL
- Améliore les performances grâce à la préparation des requêtes
- Gère la conversion des types de données

## Gestion des Types de Données

Gestion spécifique des types de données dans notre application:

### UUIDs

```javascript
// Générer un nouveau UUID
const id = cassandra.types.Uuid.random();

// Analyser une chaîne UUID
const uuid = cassandra.types.Uuid.fromString(req.params.id);
```

### Horodatages

```javascript
// Horodatage actuel
const now = new Date();

// Analyser un horodatage de la base de données
const createdAt = new Date(row.created_at);
```

### Décimaux

```javascript
// Convertir une chaîne en décimal
const price = parseFloat(req.body.price);

// Formater un décimal pour l'affichage
const formattedPrice = parseFloat(item.price).toFixed(2);
```

### Booléens

```javascript
// Convertir une chaîne en booléen
const isVegetarian = req.body.is_vegetarian === 'true' || req.body.is_vegetarian === true;
```

## Considérations de Performance

### Instructions Préparées

Toutes les requêtes utilisent des instructions préparées (`{ prepare: true }`) pour de meilleures performances:

```javascript
const query = 'SELECT * FROM menu_items WHERE id = ?';
const result = await client.execute(query, [uuid], { prepare: true });
```

### Opérations par Lot

Pour les opérations multiples liées