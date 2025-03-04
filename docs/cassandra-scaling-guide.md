# Guide de Mise à l'Échelle de Cassandra pour l'Application Menu Alimentaire

Ce document fournit des conseils détaillés sur la mise à l'échelle de la base de données Cassandra pour l'Application Menu Alimentaire, en mettant l'accent sur le maintien d'une haute disponibilité et des performances sous une charge croissante.

## Notions Fondamentales de l'Architecture Cassandra

Apache Cassandra est une base de données NoSQL distribuée conçue pour une grande évolutivité et disponibilité. Son architecture est construite sur plusieurs concepts clés:

### Composants Clés

- **Nœud**: Une seule instance Cassandra exécutée sur un serveur
- **Cluster**: Une collection de nœuds qui travaillent ensemble
- **Centre de Données**: Un regroupement logique de nœuds au sein d'un cluster
- **Rack**: Un regroupement logique de nœuds au sein d'un centre de données
- **Keyspace**: Similaire à une base de données dans un SGBDR
- **Table**: Une collection de données connexes (similaire à une table dans un SGBDR)

### Distribution des Données

Cassandra distribue les données entre les nœuds en utilisant:

- **Partitionnement**: Détermine quel nœud stocke quelles données
- **Réplication**: Assure la redondance des données sur plusieurs nœuds
- **Niveaux de Cohérence**: Équilibre entre la cohérence des données et la disponibilité

## Configuration Actuelle

L'Application Menu Alimentaire utilise la configuration Cassandra suivante:

```javascript
// Configuration actuelle du keyspace
await client.execute(`
  CREATE KEYSPACE IF NOT EXISTS food_menu 
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
`);
```

Cette configuration convient pour le développement ou les petits déploiements, mais elle doit être améliorée pour une utilisation en production.

## Stratégies de Mise à l'Échelle

### 1. Mise à l'Échelle Verticale

La mise à l'échelle verticale consiste à augmenter les ressources sur les nœuds existants:

- **Augmenter la Mémoire**: Allouer plus de mémoire à la JVM de Cassandra
- **Stockage Plus Rapide**: Utiliser des SSD pour améliorer les performances de lecture/écriture
- **Mises à Niveau du CPU**: Plus de cœurs pour un meilleur parallélisme

#### Ajustements de Configuration pour la Mise à l'Échelle Verticale

```yaml
# Ajustements de cassandra.yaml en exemple
memory_allocator: jemalloc
concurrent_reads: 32
concurrent_writes: 128
concurrent_counter_writes: 32
file_cache_size_in_mb: 512
memtable_heap_space_in_mb: 2048
memtable_offheap_space_in_mb: 2048
```

### 2. Mise à l'Échelle Horizontale

La mise à l'échelle horizontale consiste à ajouter plus de nœuds au cluster Cassandra:

#### Étape 1: Préparer le Nouveau Nœud

- Installer Cassandra sur le nouveau serveur
- Configurer le fichier `cassandra.yaml`:
  ```yaml
  cluster_name: 'FoodMenuCluster'
  seed_provider:
    - class_name: org.apache.cassandra.locator.SimpleSeedProvider
      parameters:
        - seeds: "ip_nœud_original,ip_nouveau_nœud"
  listen_address: ip_nouveau_nœud
  rpc_address: ip_nouveau_nœud
  endpoint_snitch: GossipingPropertyFileSnitch
  ```

#### Étape 2: Démarrer le Nouveau Nœud

Une fois démarré, le nouveau nœud rejoindra le cluster et commencera à recevoir des données selon la stratégie de partitionnement.

#### Étape 3: Vérifier l'État du Nœud

```bash
nodetool status
```

Cette commande devrait montrer le nouveau nœud comme faisant partie du cluster.

### 3. Réplication Multi-Datacenter

Pour la distribution géographique et la reprise après sinistre:

#### Étape 1: Configurer la Stratégie de Topologie Réseau

```javascript
await client.execute(`
  ALTER KEYSPACE food_menu 
  WITH replication = {
    'class': 'NetworkTopologyStrategy', 
    'datacenter1': 3, 
    'datacenter2': 2
  }
`);
```

#### Étape 2: Configurer un Nouveau Centre de Données

- Configurer le fichier `cassandra.yaml` de chaque nœud avec le datacenter et le rack appropriés
- Utiliser le GossipingPropertyFileSnitch ou un snitch personnalisé

#### Étape 3: Exécuter une Réparation pour Assurer la Cohérence des Données

```bash
nodetool repair -full
```

## Configuration de Connexion pour un Environnement Mis à l'Échelle

Ajustez la configuration du client pour fonctionner avec le cluster étendu:

```javascript
const client = new cassandra.Client({
  contactPoints: [
    'node1.dc1.example.com', 
    'node2.dc1.example.com', 
    'node1.dc2.example.com'
  ],
  localDataCenter: 'datacenter1',
  policies: {
    loadBalancing: new cassandra.policies.loadBalancing.TokenAwarePolicy(
      new cassandra.policies.loadBalancing.DCAwareRoundRobinPolicy('datacenter1')
    ),
    retry: new cassandra.policies.retry.RetryPolicy(),
    reconnection: new cassandra.policies.reconnection.ExponentialReconnectionPolicy(1000, 10 * 60 * 1000)
  },
  pooling: {
    coreConnectionsPerHost: {
      [cassandra.types.distance.local]: 4,
      [cassandra.types.distance.remote]: 2
    },
    maxConnectionsPerHost: {
      [cassandra.types.distance.local]: 8,
      [cassandra.types.distance.remote]: 4
    }
  }
});
```

## Réglage pour des Charges de Travail Spécifiques

### Charge de Travail à Fort Volume de Lectures

```javascript
// Augmenter la cohérence de lecture pour des données plus précises
const query = 'SELECT * FROM menu_items';
const options = { 
  prepare: true,
  consistency: cassandra.types.consistencies.localQuorum 
};
const result = await client.execute(query, [], options);
```

### Charge de Travail à Fort Volume d'Écritures

```javascript
// Utiliser une cohérence d'écriture inférieure pour de meilleures performances
const options = { 
  prepare: true,
  consistency: cassandra.types.consistencies.one 
};
await client.execute(insertQuery, params, options);
```

## Surveillance et Maintenance

### Métriques Clés à Surveiller

1. **Santé du Nœud**
   ```bash
   nodetool status
   ```

2. **Latence**
   ```bash
   nodetool cfstats food_menu
   ```

3. **Statistiques de Compactage**
   ```bash
   nodetool compactionstats
   ```

### Tâches de Maintenance Régulières

1. **Exécuter des Opérations de Réparation**
   ```bash
   nodetool repair food_menu
   ```

2. **Nettoyer Après Ajout/Suppression de Nœuds**
   ```bash
   nodetool cleanup food_menu
   ```

3. **Vérifier l'Accord de Schéma**
   ```bash
   nodetool describecluster
   ```

## Gestion des Problèmes Courants de Mise à l'Échelle

### 1. Accumulation de Tombstones

Lorsque de nombreuses suppressions se produisent, les tombstones peuvent s'accumuler et affecter les performances:

```bash
# Ajuster gc_grace_seconds pour les tables avec des suppressions fréquentes
ALTER TABLE food_menu.menu_items WITH gc_grace_seconds = 86400;
```

### 2. Délais d'Expiration de Lecture/Écriture

Ajustez les paramètres de délai d'expiration dans votre client:

```javascript
const client = new cassandra.Client({
  // ...autre configuration
  socketOptions: {
    readTimeout: 15000,  // 15 secondes
    connectTimeout: 5000  // 5 secondes
  }
});
```

### 3. Problèmes d'Équilibrage de Charge

Si certains nœuds sont surchargés:

```javascript
// Implémenter une politique d'équilibrage de charge personnalisée
const myLoadBalancingPolicy = new cassandra.policies.loadBalancing.DCAwareRoundRobinPolicy(
  'datacenter1',
  0  // Pas d'hôtes distants
);
```

## Déploiement Docker Swarm / Kubernetes

Pour les environnements conteneurisés:

### Exemple Docker Swarm

```yaml
version: '3.7'
services:
  cassandra:
    image: cassandra:latest
    deploy:
      replicas: 3
      placement:
        constraints:
          - node.role == worker
    environment:
      - CASSANDRA_SEEDS=cassandra-node1,cassandra-node2
    volumes:
      - cassandra_data:/var/lib/cassandra
    networks:
      - app-network
```

### Exemple Kubernetes

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: cassandra
spec:
  serviceName: cassandra
  replicas: 3
  selector:
    matchLabels:
      app: cassandra
  template:
    metadata:
      labels:
        app: cassandra
    spec:
      containers:
      - name: cassandra
        image: cassandra:latest
        ports:
        - containerPort: 9042
        volumeMounts:
        - name: cassandra-data
          mountPath: /var/lib/cassandra
  volumeClaimTemplates:
  - metadata:
      name: cassandra-data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 10Gi
```

## Outils de Benchmark

Pour tester votre déploiement mis à l'échelle:

1. **cassandra-stress**
   ```bash
   cassandra-stress write n=100000 -rate threads=50
   cassandra-stress read n=100000 -rate threads=50
   ```

2. **NoSQLBench**
   ```bash
   nb run driver=cql workload=cql-keyvalue tags=phase:rampup cycles=100000
   ```

## Conclusion

La mise à l'échelle de Cassandra pour l'Application Menu Alimentaire nécessite une approche réfléchie de la configuration, de la surveillance et de la maintenance. En suivant ces lignes directrices, vous pouvez créer une base de données distribuée résiliente capable de gérer une charge accrue et de fournir une haute disponibilité.

Au fur et à mesure que votre application se développe, envisagez:

1. De commencer avec un cluster de 3 nœuds au minimum pour la production
2. De mettre en place une surveillance et des alertes appropriées
3. D'effectuer une maintenance régulière, y compris des réparations et des sauvegardes
4. D'ajuster les niveaux de cohérence en fonction de vos besoins spécifiques
5. D'ajouter des nœuds horizontalement à mesure que la demande augmente

Avec une mise à l'échelle appropriée, votre cluster Cassandra fournira une base solide pour la croissance continue de l'Application Menu Alimentaire.
