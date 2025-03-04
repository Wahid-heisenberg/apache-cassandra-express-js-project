# Documentation Backend de l'Application Menu Alimentaire

Ce document fournit une explication approfondie de l'architecture backend, en mettant l'accent sur l'intégration de la base de données Cassandra, les opérations de données et les considérations de scalabilité.

## Vue d'Ensemble de l'Architecture

L'application Menu Alimentaire utilise un backend Node.js/Express avec Apache Cassandra comme base de données. Cette combinaison offre une solution évolutive et performante pour la gestion des données des éléments de menu.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│             │     │             │     │                 │
│  Client     │────▶│  Express    │────▶│  Cassandra DB   │
│  Navigateur │◀────│  Serveur    │◀────│                 │
│             │     │             │     │                 │
└─────────────┘     └─────────────┘     └─────────────────┘
```

## Intégration de la Base de Données Cassandra

### Établissement de la Connexion

L'application se connecte à Cassandra en utilisant le pilote Node.js DataStax. La connexion est établie avec des options de configuration spécifiques pour assurer la fiabilité et la performance:

```javascript
const client = new cassandra.Client({
  contactPoints: [process.env.CASSANDRA_HOST || 'localhost'],
  localDataCenter: process.env.CASSANDRA_DC || 'datacenter1',
  protocolOptions: {
    port: 9042
  },
  socketOptions: {
    connectTimeout: 30000, // 30 secondes
    readTimeout: 30000     // 30 secondes
  },
  queryOptions: {
    consistency: cassandra.types.consistencies.one,
    fetchSize: 1000,
    prepare: true,
    retryPolicy: new cassandra.policies.retry.RetryPolicy()
  },
  pooling: {
    coreConnectionsPerHost: {
      [cassandra.types.distance.local]: 2,
      [cassandra.types.distance.remote]: 1
    }
  }
});
```

Paramètres de configuration clés:

- **contactPoints**: Définit les nœuds Cassandra auxquels se connecter
- **localDataCenter**: Spécifie le centre de données à utiliser
- **connectTimeout/readTimeout**: Définit les valeurs de délai d'attente pour les connexions
- **consistency**: Définit le niveau de cohérence pour les opérations
- **prepare**: Prépare les déclarations pour une meilleure performance
- **retryPolicy**: Définit comment et quand réessayer les opérations échouées
- **pooling**: Configure le regroupement des connexions pour une meilleure gestion des ressources

### Connexion & Initialisation de la Base de Données

L'application implémente une approche robuste pour l'initialisation de la base de données:

1. Se connecter au cluster Cassandra
2. Créer un keyspace s'il n'existe pas
3. Utiliser le keyspace
4. Créer des tables si elles n'existent pas
5. Vérifier la connexion avec une requête de test

```javascript
async function connectToDatabase() {
  try {
    await client.connect();
    console.log('Connecté à Cassandra');

    // Créer le keyspace s'il n'existe pas
    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS food_menu 
      WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    `);
    
    // Utiliser le keyspace
    await client.execute('USE food_menu');

    // Créer la table menu_items
    await client.execute(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id uuid PRIMARY KEY,
        name text,
        description text,
        category text,
        price decimal,
        is_vegetarian boolean,
        created_at timestamp,
        updated_at timestamp
      )
    `);

    // Requête de test
    await client.execute('SELECT * FROM menu_items LIMIT 1');
    
    isDbConnected = true;
    dbInitialized = true;
    return true;
  } catch (err) {
    console.error('Erreur de connexion à Cassandra:', err);
    // Mécanisme de nouvelle tentative
    await sleep(5000);
    return connectToDatabase();
  }
}
```

L'application maintient deux indicateurs d'état:
- `isDbConnected`: Indique une connexion réussie au cluster Cassandra
- `dbInitialized`: Confirme que le schéma de la base de données a été correctement configuré

### Schéma de la Base de Données

La base de données utilise une seule table `menu_items` avec le schéma suivant:

| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid | Clé primaire de l'élément de menu |
| name | text | Nom de l'aliment |
| description | text | Description de l'aliment |
| category | text | Catégorie (ex. Entrée, Plat principal) |
| price | decimal | Prix de l'article |
| is_vegetarian | boolean | Si l'article est végétarien |
| created_at | timestamp | Quand l'article a été créé |
| updated_at | timestamp | Quand l'article a été mis à jour pour la dernière fois |

## Opérations de Données

### Lecture de Données

L'application récupère les éléments de menu en utilisant des requêtes CQL directes:

```javascript
// Obtenir tous les éléments de menu
app.get('/api/menu-items', checkDbConnection, async (req, res) => {
  try {
    const query = 'SELECT * FROM menu_items';
    const result = await client.execute(query, [], { prepare: true });
    
    // S'assurer que nous renvoyons toujours un tableau
    const items = result.rows && Array.isArray(result.rows) ? result.rows : [];
    console.log(`${items.length} éléments de menu récupérés`);
    
    res.json(items);
  } catch (err) {
    console.error('Erreur lors de la récupération des éléments de menu:', err);
    res.status(500).json({ 
      error: 'Échec de la récupération des éléments de menu',
      details: err.message 
    });
  }
});
```

Pour récupérer des éléments individuels:

```javascript
// Obtenir un élément de menu par ID
app.get('/api/menu-items/:id', checkDbConnection, async (req, res) => {
  try {
    // Valider le format UUID
    let uuid = cassandra.types.Uuid.fromString(req.params.id);
    const query = 'SELECT * FROM menu_items WHERE id = ?';
    const result = await client.execute(query, [uuid], { prepare: true });
    
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Élément de menu introuvable' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    // Gestion des erreurs...
  }
});
```

### Création de Données

Les nouveaux éléments de menu sont insérés avec des instructions préparées:

```javascript
// Créer un nouvel élément de menu
app.post('/api/menu-items', checkDbConnection, async (req, res) => {
  try {
    const { name, description, category, price, is_vegetarian } = req.body;
    
    // Validation...
    
    // Générer UUID et horodatage
    const id = cassandra.types.Uuid.random();
    const now = new Date();
    
    const query = `
      INSERT INTO menu_items (id, name, description, category, price, is_vegetarian, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await client.execute(query, [
      id, name, description, category, 
      parseFloat(price), isVegetarian, now, now
    ], { prepare: true });
    
    res.status(201).json({ 
      id: id.toString(), 
      message: 'Élément de menu créé avec succès' 
    });
  } catch (err) {
    // Gestion des erreurs...
  }
});
```

### Mise à Jour des Données

Les mises à jour sont effectuées à l'aide d'instructions préparées avec des paramètres:

```javascript
// Mettre à jour un élément de menu
app.put('/api/menu-items/:id', checkDbConnection, async (req, res) => {
  try {
    // Validation...
    
    const query = `
      UPDATE menu_items 
      SET name = ?, description = ?, category = ?, price = ?, is_vegetarian = ?, updated_at = ?
      WHERE id = ?
    `;
    
    await client.execute(query, [
      name, description, category, priceValue, 
      isVegetarian, now, uuid
    ], { prepare: true });
    
    res.json({ message: 'Élément de menu mis à jour avec succès' });
  } catch (err) {
    // Gestion des erreurs...
  }
});
```

### Suppression de Données

Les éléments de menu sont supprimés par ID:

```javascript
// Supprimer un élément de menu
app.delete('/api/menu-items/:id', checkDbConnection, async (req, res) => {
  try {
    let uuid = cassandra.types.Uuid.fromString(req.params.id);
    
    const query = 'DELETE FROM menu_items WHERE id = ?';
    await client.execute(query, [uuid], { prepare: true });
    res.json({ message: 'Élément de menu supprimé avec succès' });
  } catch (err) {
    // Gestion des erreurs...
  }
});
```

### Recherche de Données

L'implémentation de la recherche utilise une approche de filtrage en mémoire en raison des limitations de Cassandra en matière de recherche de texte:

```javascript
// Rechercher des éléments de menu
app.get('/api/search', checkDbConnection, async (req, res) => {
  try {
    const searchTerm = req.query.q ? req.query.q.toLowerCase() : '';
    
    if (!searchTerm) {
      // Si aucun terme de recherche, retourner tous les éléments
      return res.redirect('/api/menu-items');
    }
    
    // Récupérer tout et filtrer en mémoire
    const query = 'SELECT * FROM menu_items';
    const result = await client.execute(query, [], { prepare: true });
    
    // Filtrer les résultats
    const filteredItems = result.rows.filter(item => 
      (item.name && item.name.toLowerCase().includes(searchTerm)) || 
      (item.description && item.description.toLowerCase().includes(searchTerm)) ||
      (item.category && item.category.toLowerCase().includes(searchTerm))
    );
    
    res.json(filteredItems);
  } catch (err) {
    // Gestion des erreurs...
  }
});
```

## Optimisations de Performance

### Instructions Préparées

Toutes les opérations de base de données utilisent des instructions préparées (`{ prepare: true }`) qui:
- Améliorent les performances en analysant et planifiant les requêtes une seule fois
- Protègent contre les attaques par injection CQL
- Permettent l'exécution efficace de la même requête avec différents paramètres

### Regroupement de Connexions

L'application utilise le regroupement de connexions pour maintenir un ensemble sain de connexions à Cassandra:

```javascript
pooling: {
  coreConnectionsPerHost: {
    [cassandra.types.distance.local]: 2,
    [cassandra.types.distance.remote]: 1
  }
}
```

Cela minimise la surcharge d'établissement de nouvelles connexions pour chaque requête.

## Considérations de Scalabilité

### Mise à l'Échelle Horizontale

L'architecture de l'application prend en charge la mise à l'échelle horizontale grâce à plusieurs mécanismes:

1. **Conception d'Application Sans État**: Le serveur d'application ne maintient aucun état de session, ce qui facilite la mise à l'échelle horizontale en ajoutant plus d'instances de serveur d'application.

2. **Architecture Distribuée de Cassandra**: Cassandra est conçu pour une scalabilité horizontale sur plusieurs nœuds:

   ```javascript
   // Configuration de plusieurs points de contact:
   const client = new cassandra.Client({
     contactPoints: ['cassandra1', 'cassandra2', 'cassandra3'],
     // autre configuration...
   });
   ```

3. **Équilibrage de Charge**: Dans une configuration multi-nœuds, l'application distribuerait les requêtes entre les nœuds en utilisant les politiques d'équilibrage de charge intégrées de Cassandra:

   ```javascript
   const client = new cassandra.Client({
     // ...autre configuration
     policies: {
       loadBalancing: new cassandra.policies.loadBalancing.DCAwareRoundRobinPolicy('datacenter1')
     }
   });
   ```

### Déploiement Multi-Datacenter

Pour une distribution géographique, Cassandra prend en charge les déploiements multi-datacenter:

```javascript
// Configuration d'une configuration multi-datacenter:
const client = new cassandra.Client({
  contactPoints: ['dc1-node1', 'dc1-node2', 'dc2-node1', 'dc2-node2'],
  policies: {
    loadBalancing: new cassandra.policies.loadBalancing.TokenAwarePolicy(
      new cassandra.policies.loadBalancing.DCAwareRoundRobinPolicy('datacenter1', 1)
    )
  },
  // autre configuration...
});
```

Cette configuration:
- Préfère les nœuds dans datacenter1
- Permet le repli sur 1 nœud dans les datacenters distants si nécessaire

### Recommandations de Mise à l'Échelle

Pour déployer l'application sur plusieurs serveurs:

1. **Mise à l'Échelle de la Couche Application**:
   - Déployer plusieurs instances de l'application Node.js
   - Utiliser un équilibreur de charge (p. ex. Nginx, HAProxy) pour distribuer le trafic
   - Configurer des sessions persistantes si vous ajoutez l'authentification des utilisateurs

2. **Mise à l'Échelle de la Couche Base de Données**:
   - Ajouter plus de nœuds Cassandra au cluster
   - Configurer le facteur de réplication en fonction des besoins de disponibilité
   - Ajuster les niveaux de cohérence en fonction des modèles de lecture/écriture
   - Considérer les stratégies de partitionnement des données

   ```javascript
   // Créer un keyspace avec NetworkTopologyStrategy pour les déploiements multi-DC
   await client.execute(`
     CREATE KEYSPACE IF NOT EXISTS food_menu 
     WITH replication = {
       'class': 'NetworkTopologyStrategy', 
       'datacenter1': 3, 
       'datacenter2': 2
     }
   `);
   ```

3. **Surveillance et Maintenance**:
   - Implémenter des contrôles de santé et de surveillance
   - Mettre en place des stratégies de sauvegarde automatisées
   - Planifier des procédures de remplacement et de réparation des nœuds

## Gestion des Erreurs et Résilience

L'application implémente plusieurs modèles de résilience:

### Logique de Nouvelle Tentative de Connexion

Lorsque la connexion à la base de données échoue, l'application tente de se reconnecter:

```javascript
async function connectToDatabase() {
  try {
    // Logique de connexion...
  } catch (err) {
    console.error('Erreur de connexion à Cassandra:', err);
    await sleep(5000);
    return connectToDatabase(); // Nouvelle tentative récursive
  }
}
```

### Validation de Connexion des Requêtes

Chaque point d'accès API vérifie la connectivité à la base de données avant le traitement:

```javascript
const checkDbConnection = (req, res, next) => {
  if (!isDbConnected || !dbInitialized) {
    return res.status(503).json({ 
      error: 'Connexion à la base de données pas encore établie.' 
    });
  }
  next();
};

// Utilisation du middleware
app.get('/api/menu-items', checkDbConnection, async (req, res) => {
  // Logique du gestionnaire...
});
```

### Contrôles de Santé

L'application fournit des points d'accès pour la surveillance:

```javascript
// Point d'accès de contrôle de santé
app.get('/health', (req, res) => {
  res.json({ 
    status: 'UP',
    database: isDbConnected ? 'Connecté' : 'Déconnecté',
    initialized: dbInitialized ? 'Oui' : 'Non'
  });
});

// Point d'accès de débogage
app.get('/debug/db', (req, res) => {
  res.json({
    connected: isDbConnected,
    initialized: dbInitialized,
    contactPoints: client.options.contactPoints,
    datacenter: client.options.localDataCenter
  });
});
```

## Bonnes Pratiques et Recommandations

1. **Améliorations de Sécurité**:
   - Implémenter un mécanisme d'authentification pour les points d'accès API
   - Configurer le contrôle d'accès basé sur les rôles dans Cassandra
   - Utiliser SSL/TLS pour les connexions Cassandra

   ```javascript
   // Exemple de connexion sécurisée
   const client = new cassandra.Client({
     // ...autre configuration
     sslOptions: {
       ca: [fs.readFileSync('/path/to/ca-cert.pem')],
       requestCert: true
     },
     authProvider: new cassandra.auth.PlainTextAuthProvider('username', 'password')
   });
   ```

2. **Optimisations de Performance**:
   - Implémenter la pagination pour les grands ensembles de résultats
   - Ajouter la mise en cache pour les données fréquemment consultées
   - Créer des index secondaires pour les modèles de recherche courants

3. **Surveillance et Observabilité**:
   - Ajouter la journalisation et le traçage des requêtes
   - Implémenter la collecte de métriques pour les performances de la base de données
   - Configurer des alertes pour les défaillances de connexion et la dégradation des performances

## Conclusion

Le backend de l'Application Menu Alimentaire est conçu en gardant à l'esprit l'évolutivité, en tirant parti de l'architecture distribuée de Cassandra pour une haute disponibilité et un haut débit. L'application peut être facilement mise à l'échelle horizontalement en ajoutant plus de serveurs d'application et de nœuds Cassandra au fur et à mesure que la demande augmente.

Les points forts clés de l'architecture comprennent:
- Conception d'application sans état
- Instructions préparées pour des opérations de base de données efficaces
- Regroupement de connexions pour les performances
- Mécanismes robustes de gestion des erreurs et de récupération
- Support pour les déploiements multi-datacenter

En suivant les recommandations de mise à l'échelle et les meilleures pratiques décrites dans ce document, l'application peut être déployée sur plusieurs serveurs pour gérer une charge accrue et fournir une redondance géographique.
