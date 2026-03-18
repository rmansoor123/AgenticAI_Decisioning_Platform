import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';

const TIERS = ['All', 'Big Tech', 'Scale-ups', 'Emerging'];

const CATEGORIES = [
  'All', 'Search/Ads', 'Social', 'Cloud', 'E-Commerce', 'Fintech',
  'AI/ML', 'Streaming', 'Mobility', 'Enterprise', 'Security', 'DevTools',
  'Health', 'Gaming',
];

const TIER_BADGE = {
  'big-tech': 'bg-amber-900/50 text-amber-300 border-amber-700/50',
  'scale-up': 'bg-blue-900/50 text-blue-300 border-blue-700/50',
  'emerging': 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50',
};

const TIER_LABEL = {
  'big-tech': 'Big Tech',
  'scale-up': 'Scale-up',
  'emerging': 'Emerging',
};

const CATEGORY_COLORS = {
  'Search/Ads': 'bg-orange-900/50 text-orange-300 border-orange-700/50',
  Social: 'bg-blue-900/50 text-blue-300 border-blue-700/50',
  Cloud: 'bg-sky-900/50 text-sky-300 border-sky-700/50',
  'E-Commerce': 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50',
  Fintech: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50',
  'AI/ML': 'bg-purple-900/50 text-purple-300 border-purple-700/50',
  Streaming: 'bg-pink-900/50 text-pink-300 border-pink-700/50',
  Mobility: 'bg-amber-900/50 text-amber-300 border-amber-700/50',
  Enterprise: 'bg-indigo-900/50 text-indigo-300 border-indigo-700/50',
  Security: 'bg-red-900/50 text-red-300 border-red-700/50',
  DevTools: 'bg-teal-900/50 text-teal-300 border-teal-700/50',
  Health: 'bg-lime-900/50 text-lime-300 border-lime-700/50',
  Gaming: 'bg-violet-900/50 text-violet-300 border-violet-700/50',
};

const COMPANIES = [
  // ─── BIG TECH (20) ───
  {
    name: 'Google',
    tier: 'big-tech',
    category: 'Search/Ads',
    description: 'Search, ads, cloud',
    flagships: [
      { product: 'Google Search', stack: 'C++, Java, Bigtable, MapReduce, TensorFlow, custom ML ranking' },
      { product: 'YouTube', stack: 'Python, Java, C++, Bigtable, Spanner, Vitess, custom CDN' },
    ],
    infra: 'Borg (precursor to K8s), custom TPUs, Spanner, Bigtable, BigQuery, Pub/Sub',
    ml: 'TensorFlow (created), JAX, Vertex AI, Gemini',
    backend: 'C++, Java, Go, Python',
    frontend: 'Angular, Lit',
  },
  {
    name: 'Apple',
    tier: 'big-tech',
    category: 'Enterprise',
    description: 'Consumer hardware + services',
    flagships: [
      { product: 'iCloud', stack: 'FoundationDB (acquired), Cassandra, custom object storage' },
      { product: 'App Store', stack: 'Objective-C, Swift, custom ML for review/fraud' },
    ],
    infra: 'Private data centers + GCP/AWS, custom silicon (M-series, Neural Engine)',
    ml: 'Core ML, Create ML, on-device inference',
    backend: 'Swift, Objective-C, Java, Scala',
    frontend: 'SwiftUI, UIKit',
  },
  {
    name: 'Microsoft',
    tier: 'big-tech',
    category: 'Cloud',
    description: 'Enterprise + cloud',
    flagships: [
      { product: 'Azure', stack: 'Custom Service Fabric, Cosmos DB, Azure Synapse, Event Hubs' },
      { product: 'Teams', stack: 'Electron, React, microservices (C#/.NET)' },
    ],
    infra: 'Custom data centers, Azure Service Fabric',
    ml: 'Azure ML, Cognitive Services, OpenAI partnership, Phi models',
    backend: 'C#, .NET, TypeScript, Rust',
    frontend: 'React, Fluent UI',
  },
  {
    name: 'Amazon',
    tier: 'big-tech',
    category: 'E-Commerce',
    description: 'E-commerce + cloud',
    flagships: [
      { product: 'AWS', stack: 'Custom hardware, Nitro hypervisor, Graviton chips' },
      { product: 'Amazon.com', stack: 'Java, DynamoDB, S3, Kinesis, custom recommendation engine' },
    ],
    infra: 'AWS (built their own), 30+ regions',
    ml: 'SageMaker, Bedrock, Alexa NLU, fraud detection',
    backend: 'Java, Python, Go, Rust',
    frontend: 'React, custom',
  },
  {
    name: 'Meta',
    tier: 'big-tech',
    category: 'Social',
    description: 'Social networking',
    flagships: [
      { product: 'Facebook', stack: 'MySQL (custom), Memcached, TAO (graph), Presto' },
      { product: 'Instagram', stack: 'Python (Django), Cassandra, PostgreSQL, Redis' },
    ],
    infra: 'Custom data centers, custom hardware',
    ml: 'PyTorch (created), DLRM recommendation, Llama models',
    backend: 'Hack (PHP), C++, Python, Rust',
    frontend: 'React (created), React Native',
  },
  {
    name: 'Netflix',
    tier: 'big-tech',
    category: 'Streaming',
    description: 'Streaming platform',
    flagships: [
      { product: 'Streaming', stack: 'Java (Spring Boot), Cassandra, CockroachDB, Zuul gateway' },
      { product: 'Recommendation', stack: 'Custom ML, Apache Spark, TensorFlow' },
    ],
    infra: 'AWS (largest customer), Open Connect CDN',
    ml: 'Custom recommendation engine, content personalization',
    backend: 'Java, Python, Go, Node.js',
    frontend: 'React',
  },
  {
    name: 'Uber',
    tier: 'big-tech',
    category: 'Mobility',
    description: 'Mobility platform',
    flagships: [
      { product: 'Marketplace', stack: 'Go, Java, Python, Schemaless (custom DB)' },
      { product: 'ML Platform', stack: 'Michelangelo (custom), PyTorch, real-time pricing' },
    ],
    infra: 'Multi-cloud + on-prem, Kubernetes (Peloton)',
    ml: 'Michelangelo (custom), PyTorch, real-time pricing',
    backend: 'Go, Java, Python',
    frontend: 'React, Fusion.js',
  },
  {
    name: 'Tesla',
    tier: 'big-tech',
    category: 'Mobility',
    description: 'EV + autonomous driving',
    flagships: [
      { product: 'Autopilot', stack: 'Custom neural networks, C++, CUDA, custom silicon (Dojo)' },
      { product: 'Energy', stack: 'Python, Django, PostgreSQL, Redis' },
    ],
    infra: 'Custom data centers, Dojo supercomputer',
    ml: 'Custom vision models, occupancy networks, HW3/HW4 chips',
    backend: 'Python, C++, Java',
    frontend: 'React, custom',
  },
  {
    name: 'Nvidia',
    tier: 'big-tech',
    category: 'AI/ML',
    description: 'GPU + AI computing',
    flagships: [
      { product: 'CUDA', stack: 'C/C++, custom compiler toolchain' },
      { product: 'GPU Cloud', stack: 'Kubernetes, Triton inference server' },
    ],
    infra: 'Custom hardware, DGX systems',
    ml: 'cuDNN, TensorRT, NeMo, Omniverse',
    backend: 'C++, Python, CUDA',
    frontend: 'React',
  },
  {
    name: 'Salesforce',
    tier: 'big-tech',
    category: 'Enterprise',
    description: 'CRM platform',
    flagships: [
      { product: 'Sales Cloud', stack: 'Java (Apex), Oracle DB, custom multi-tenant arch' },
      { product: 'Einstein AI', stack: 'Custom NLP, TensorFlow, PyTorch' },
    ],
    infra: 'Private cloud + AWS, Kubernetes',
    ml: 'Einstein AI, custom NLP, TensorFlow, PyTorch',
    backend: 'Java, Apex, Python',
    frontend: 'Lightning Web Components',
  },
  {
    name: 'Oracle',
    tier: 'big-tech',
    category: 'Enterprise',
    description: 'Enterprise DB + Cloud',
    flagships: [
      { product: 'Oracle DB', stack: 'C, custom storage engine, RAC clustering' },
      { product: 'OCI', stack: 'Bare metal cloud, custom networking' },
    ],
    infra: 'Custom data centers, Gen2 Cloud',
    ml: 'Oracle AI, custom analytics',
    backend: 'Java, C, C++',
    frontend: 'JET, React',
  },
  {
    name: 'IBM',
    tier: 'big-tech',
    category: 'Enterprise',
    description: 'Enterprise AI + Cloud',
    flagships: [
      { product: 'watsonx', stack: 'Custom foundation models, Red Hat OpenShift' },
    ],
    infra: 'Red Hat (acquired), OpenShift, LinuxONE',
    ml: 'watsonx.ai, Watson NLP',
    backend: 'Java, Python, Go',
    frontend: 'Carbon design system (React)',
  },
  {
    name: 'Adobe',
    tier: 'big-tech',
    category: 'Enterprise',
    description: 'Creative + document platform',
    flagships: [
      { product: 'Creative Cloud', stack: 'C++, custom rendering engines, Electron' },
      { product: 'Firefly', stack: 'Custom generative AI models, Sensei ML' },
    ],
    infra: 'AWS + Azure, Kubernetes',
    ml: 'Sensei ML, Firefly generative AI',
    backend: 'Java, C++, Node.js',
    frontend: 'React, Spectrum design system',
  },
  {
    name: 'Intel',
    tier: 'big-tech',
    category: 'Enterprise',
    description: 'Chips + software',
    flagships: [
      { product: 'oneAPI', stack: 'C++, SYCL, custom compilers' },
    ],
    infra: 'Custom fabs, Habana AI accelerators',
    ml: 'OpenVINO, Habana Gaudi',
    backend: 'C++, Python, Rust',
    frontend: 'React',
  },
  {
    name: 'Samsung',
    tier: 'big-tech',
    category: 'Enterprise',
    description: 'Consumer electronics',
    flagships: [
      { product: 'SmartThings', stack: 'Java, Groovy, AWS' },
      { product: 'Galaxy AI', stack: 'On-device ML, custom NPU' },
    ],
    infra: 'Samsung Cloud, custom data centers',
    ml: 'On-device ML, custom NPU',
    backend: 'Java, Kotlin, C++',
    frontend: 'Custom (Android)',
  },
  {
    name: 'X (Twitter)',
    tier: 'big-tech',
    category: 'Social',
    description: 'Social platform',
    flagships: [
      { product: 'Timeline', stack: 'Scala, Java, Manhattan (custom KV), Gizzard (sharding)' },
    ],
    infra: 'GCP + on-prem, Kubernetes',
    ml: 'Custom ML ranking, trust & safety',
    backend: 'Scala, Java, Python, Go',
    frontend: 'React, Node.js',
  },
  {
    name: 'Snap',
    tier: 'big-tech',
    category: 'Social',
    description: 'Camera/messaging platform',
    flagships: [
      { product: 'Snapchat', stack: 'GCP, Spanner, Bigtable, Pub/Sub' },
    ],
    infra: 'GCP',
    ml: 'Custom ML, on-device AR vision',
    backend: 'Go, Java, Python',
    frontend: 'Custom mobile (Swift, Kotlin)',
  },
  {
    name: 'Spotify',
    tier: 'big-tech',
    category: 'Streaming',
    description: 'Music streaming',
    flagships: [
      { product: 'Discover Weekly', stack: 'Custom ML recommendation, collaborative filtering' },
    ],
    infra: 'GCP, Kubernetes',
    ml: 'Custom recommendation, collaborative filtering',
    backend: 'Java, Python, Go',
    frontend: 'React, Backstage (created)',
  },
  {
    name: 'Airbnb',
    tier: 'big-tech',
    category: 'E-Commerce',
    description: 'Home sharing platform',
    flagships: [
      { product: 'Search/Pricing', stack: 'Custom ML, Apache Spark, Druid' },
      { product: 'Trust & Safety', stack: 'ML fraud detection, graph analysis' },
    ],
    infra: 'AWS, Kubernetes',
    ml: 'Custom ML, Zipline (feature store)',
    backend: 'Ruby on Rails, Java, Kotlin',
    frontend: 'React',
  },
  {
    name: 'TikTok/ByteDance',
    tier: 'big-tech',
    category: 'Social',
    description: 'Short video platform',
    flagships: [
      { product: 'For You Page', stack: 'Custom recommendation engine (one of the best in industry)' },
    ],
    infra: 'Multi-cloud, custom CDN, custom KV stores',
    ml: 'Custom recommendation engine',
    backend: 'Go, Python, Java',
    frontend: 'React, custom mobile',
  },

  // ─── SCALE-UPS (40) ───
  {
    name: 'Stripe',
    tier: 'scale-up',
    category: 'Fintech',
    description: 'Payment infrastructure',
    infra: 'AWS, Kubernetes, Envoy proxy',
    data: 'Kafka, Spark, Presto, S3',
    ml: 'Ruby ML, scikit-learn, real-time fraud (Radar)',
    backend: 'Ruby, Java, Go',
    frontend: 'React',
  },
  {
    name: 'Shopify',
    tier: 'scale-up',
    category: 'E-Commerce',
    description: 'E-commerce platform',
    infra: 'GCP, Kubernetes, custom CDN',
    data: 'MySQL, Kafka, Flink, BigQuery',
    ml: 'Ruby ML, TensorFlow, fraud detection',
    backend: 'Ruby on Rails, Go, Rust',
    frontend: 'React, Polaris',
  },
  {
    name: 'Databricks',
    tier: 'scale-up',
    category: 'AI/ML',
    description: 'Data + AI platform',
    infra: 'AWS, Azure, GCP',
    data: 'Delta Lake, Unity Catalog, Photon engine',
    ml: 'Created Apache Spark, Delta Lake, MLflow',
    backend: 'Scala, Python, Go',
    frontend: 'React',
  },
  {
    name: 'Snowflake',
    tier: 'scale-up',
    category: 'Cloud',
    description: 'Data cloud',
    infra: 'AWS, Azure, GCP (multi-cloud day 1)',
    data: 'Custom columnar storage, S3/Blob/GCS',
    backend: 'C++, Java, Python',
    frontend: 'React',
  },
  {
    name: 'Palantir',
    tier: 'scale-up',
    category: 'Enterprise',
    description: 'Data analytics platform',
    infra: 'AWS, Azure, on-prem, FedRAMP',
    data: 'Custom ontology engine, Spark, custom graph',
    backend: 'Java, TypeScript, Python',
    frontend: 'React, Blueprint',
  },
  {
    name: 'Cloudflare',
    tier: 'scale-up',
    category: 'Cloud',
    description: 'Edge computing + CDN',
    infra: 'Custom hardware in 300+ cities',
    data: 'ClickHouse, Kafka, PostgreSQL, custom KV (Workers KV)',
    ml: 'V8 isolates, Rust, custom edge runtime',
    backend: 'Rust, Go, C, Lua',
    frontend: 'React',
  },
  {
    name: 'Datadog',
    tier: 'scale-up',
    category: 'DevTools',
    description: 'Observability platform',
    infra: 'AWS + GCP, Kubernetes',
    data: 'Kafka, Cassandra, custom time-series DB',
    backend: 'Go, Python, Java',
    frontend: 'React, D3.js',
  },
  {
    name: 'CrowdStrike',
    tier: 'scale-up',
    category: 'Security',
    description: 'Endpoint security',
    infra: 'AWS, custom cloud (Falcon platform)',
    data: 'Kafka, Cassandra, Elasticsearch, custom graph DB',
    ml: 'Custom threat graph, behavioral AI',
    backend: 'Go, Python, C++',
    frontend: 'React, Ember.js',
  },
  {
    name: 'Twilio',
    tier: 'scale-up',
    category: 'Enterprise',
    description: 'Communications API',
    infra: 'AWS, Kubernetes',
    data: 'MySQL, Redis, Kafka, CockroachDB',
    backend: 'Java, Python, Go',
    frontend: 'React, Paste',
  },
  {
    name: 'Square/Block',
    tier: 'scale-up',
    category: 'Fintech',
    description: 'Financial services',
    infra: 'AWS, GCP, Kubernetes',
    data: 'Kafka, Spark, BigQuery, Snowflake',
    ml: 'Custom ML fraud detection',
    backend: 'Java, Kotlin, Go, Ruby',
    frontend: 'React, Swift',
  },
  {
    name: 'Coinbase',
    tier: 'scale-up',
    category: 'Fintech',
    description: 'Crypto exchange',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, MongoDB, Redis, Kafka',
    backend: 'Go, Ruby, Python',
    frontend: 'React, React Native',
  },
  {
    name: 'Robinhood',
    tier: 'scale-up',
    category: 'Fintech',
    description: 'Stock trading platform',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Kafka, Airflow, Flink',
    backend: 'Python, Go, Elixir',
    frontend: 'React, React Native',
  },
  {
    name: 'Notion',
    tier: 'scale-up',
    category: 'Enterprise',
    description: 'Productivity workspace',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Redis, Elasticsearch, S3',
    backend: 'Kotlin, TypeScript, Rust',
    frontend: 'React',
  },
  {
    name: 'Figma',
    tier: 'scale-up',
    category: 'DevTools',
    description: 'Collaborative design tool',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Redis, S3',
    backend: 'TypeScript, Rust, C++ (rendering)',
    frontend: 'Custom WebGL, React',
  },
  {
    name: 'Canva',
    tier: 'scale-up',
    category: 'Enterprise',
    description: 'Design platform',
    infra: 'AWS, Kubernetes',
    data: 'MySQL, Redis, Kafka, DynamoDB',
    backend: 'Java, TypeScript, Python',
    frontend: 'React',
  },
  {
    name: 'Discord',
    tier: 'scale-up',
    category: 'Social',
    description: 'Communication platform',
    infra: 'GCP, Kubernetes',
    data: 'ScyllaDB (migrated from Cassandra), Kafka, Elasticsearch',
    backend: 'Rust, Python, Elixir, Go',
    frontend: 'React, Electron',
  },
  {
    name: 'Slack',
    tier: 'scale-up',
    category: 'Enterprise',
    description: 'Business messaging',
    infra: 'AWS, Kubernetes',
    data: 'MySQL (Vitess), Kafka, Redis, Elasticsearch',
    backend: 'Java, Go, PHP, Hack',
    frontend: 'React, Electron',
  },
  {
    name: 'Reddit',
    tier: 'scale-up',
    category: 'Social',
    description: 'Community platform',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Cassandra, Kafka, Druid',
    backend: 'Python, Go, Rust',
    frontend: 'React',
  },
  {
    name: 'Pinterest',
    tier: 'scale-up',
    category: 'Social',
    description: 'Visual discovery',
    infra: 'AWS, Kubernetes',
    data: 'MySQL, HBase, Kafka, Druid, S3',
    backend: 'Python, Java, Go, Elixir',
    frontend: 'React, Gestalt',
  },
  {
    name: 'Atlassian',
    tier: 'scale-up',
    category: 'DevTools',
    description: 'Dev tools (Jira, Confluence)',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Elasticsearch',
    backend: 'Java, Kotlin, Python, Go',
    frontend: 'React, Atlaskit',
  },
  {
    name: 'PayPal',
    tier: 'scale-up',
    category: 'Fintech',
    description: 'Digital payments',
    infra: 'Private cloud + GCP, Kubernetes',
    data: 'Kafka, Hadoop, Teradata, Apache Giraph (graph)',
    backend: 'Java, Node.js, C++',
    frontend: 'React',
  },
  {
    name: 'Lyft',
    tier: 'scale-up',
    category: 'Mobility',
    description: 'Ride sharing',
    infra: 'AWS, Kubernetes',
    data: 'Flink, Kafka, Druid, S3',
    ml: 'Created Flyte (ML orchestration)',
    backend: 'Python, Go, Java',
    frontend: 'React',
  },
  {
    name: 'DoorDash',
    tier: 'scale-up',
    category: 'Mobility',
    description: 'Food delivery',
    infra: 'AWS, Kubernetes',
    data: 'Kafka, Flink, Snowflake, CockroachDB',
    backend: 'Kotlin, Python, Go',
    frontend: 'React, React Native',
  },
  {
    name: 'Instacart',
    tier: 'scale-up',
    category: 'E-Commerce',
    description: 'Grocery delivery',
    infra: 'GCP, Kubernetes',
    data: 'PostgreSQL, Kafka, BigQuery, Redis',
    backend: 'Ruby on Rails, Python, Go',
    frontend: 'React',
  },
  {
    name: 'Plaid',
    tier: 'scale-up',
    category: 'Fintech',
    description: 'Financial data API',
    infra: 'AWS, Kubernetes, Terraform',
    data: 'PostgreSQL, DynamoDB, Kafka, Elasticsearch',
    backend: 'Go, Python, TypeScript',
    frontend: 'React',
  },
  {
    name: 'Revolut',
    tier: 'scale-up',
    category: 'Fintech',
    description: 'Digital banking',
    infra: 'AWS, GCP, Kubernetes',
    data: 'PostgreSQL, Kafka, BigQuery, Redis',
    backend: 'Java, Kotlin, Python',
    frontend: 'React Native',
  },
  {
    name: 'Adyen',
    tier: 'scale-up',
    category: 'Fintech',
    description: 'Payment platform',
    infra: 'Private data centers, bare metal (no cloud)',
    data: 'Custom event streaming, MySQL',
    backend: 'Java (99% of codebase)',
    frontend: 'React',
  },
  {
    name: 'Elastic',
    tier: 'scale-up',
    category: 'DevTools',
    description: 'Search + observability',
    infra: 'Elastic Cloud (AWS, GCP, Azure)',
    data: 'Elasticsearch (Java, Lucene)',
    backend: 'Java, Go, Rust',
    frontend: 'React, EUI',
  },
  {
    name: 'MongoDB',
    tier: 'scale-up',
    category: 'DevTools',
    description: 'Document database',
    infra: 'Atlas on Kubernetes, custom management plane',
    data: 'C++, custom WiredTiger storage',
    backend: 'C++, Go, Python',
    frontend: 'React, Leafygreen UI',
  },
  {
    name: 'Confluent',
    tier: 'scale-up',
    category: 'DevTools',
    description: 'Event streaming platform',
    infra: 'Kubernetes, custom Kafka management',
    data: 'Created Apache Kafka (founders from LinkedIn)',
    backend: 'Java, Go, Python',
    frontend: 'React',
  },
  {
    name: 'HashiCorp',
    tier: 'scale-up',
    category: 'DevTools',
    description: 'Infrastructure tools',
    infra: 'AWS, GCP, Azure',
    data: 'Consul (service mesh), Vault (secrets)',
    backend: 'Go (100% for OSS)',
    frontend: 'Ember.js, React',
  },
  {
    name: 'Okta',
    tier: 'scale-up',
    category: 'Security',
    description: 'Identity platform',
    infra: 'AWS, Kubernetes',
    data: 'MySQL, DynamoDB, Elasticsearch',
    backend: 'Java, Go, Node.js',
    frontend: 'React',
  },
  {
    name: 'Palo Alto Networks',
    tier: 'scale-up',
    category: 'Security',
    description: 'Cybersecurity platform',
    infra: 'GCP, AWS, custom appliances',
    data: 'Cortex: Custom SIEM, ML threat detection',
    backend: 'Python, Go, C/C++',
    frontend: 'React',
  },
  {
    name: 'Fortinet',
    tier: 'scale-up',
    category: 'Security',
    description: 'Network security',
    infra: 'Custom hardware (FortiGate appliances)',
    data: 'FortiOS: C, custom ASIC chips',
    backend: 'C, Python',
    frontend: 'Custom, Angular',
  },
  {
    name: 'Zscaler',
    tier: 'scale-up',
    category: 'Security',
    description: 'Cloud security (Zero Trust)',
    infra: '150+ data centers, custom',
    data: 'Zero Trust Exchange: Custom proxy, ML inspection',
    backend: 'Java, C++, Go',
    frontend: 'React',
  },
  {
    name: 'Toast',
    tier: 'scale-up',
    category: 'Enterprise',
    description: 'Restaurant technology',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Kafka, Redis',
    backend: 'Kotlin, Java, Go',
    frontend: 'React',
  },
  {
    name: 'Rippling',
    tier: 'scale-up',
    category: 'Enterprise',
    description: 'HR/IT platform',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Redis, Elasticsearch',
    backend: 'Python (Django), Go',
    frontend: 'React',
  },
  {
    name: 'Airtable',
    tier: 'scale-up',
    category: 'Enterprise',
    description: 'Low-code platform',
    infra: 'AWS, Kubernetes',
    data: 'Custom hyperbase, PostgreSQL, Redis',
    backend: 'Node.js, Ruby, Go',
    frontend: 'React',
  },
  {
    name: 'Miro',
    tier: 'scale-up',
    category: 'Enterprise',
    description: 'Collaborative whiteboard',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Redis, Elasticsearch',
    backend: 'Java, Node.js',
    frontend: 'React, custom Canvas',
  },
  {
    name: 'Grafana Labs',
    tier: 'scale-up',
    category: 'DevTools',
    description: 'Observability platform',
    infra: 'AWS, GCP, Kubernetes',
    data: 'Grafana/Loki/Tempo/Mimir: All Go',
    backend: 'Go (100%)',
    frontend: 'React, TypeScript',
  },

  // ─── EMERGING (40) ───
  {
    name: 'OpenAI',
    tier: 'emerging',
    category: 'AI/ML',
    description: 'AI research lab',
    infra: 'Azure (exclusive), custom GPU clusters',
    data: 'Custom training data pipelines',
    ml: 'GPT/DALL-E: Custom transformer architecture, RLHF',
    backend: 'Python, Rust, Go',
    frontend: 'React, Next.js',
  },
  {
    name: 'Anthropic',
    tier: 'emerging',
    category: 'AI/ML',
    description: 'AI safety research',
    infra: 'AWS, GCP, custom GPU clusters',
    data: 'Custom training pipeline',
    ml: 'Claude: Constitutional AI, custom training',
    backend: 'Python, Rust, TypeScript',
    frontend: 'React',
  },
  {
    name: 'Mistral AI',
    tier: 'emerging',
    category: 'AI/ML',
    description: 'Open source AI models',
    infra: 'Custom GPU clusters',
    ml: 'Mixtral/Mistral: Custom MoE architecture',
    backend: 'Python, C++, Rust',
    frontend: 'React',
  },
  {
    name: 'Perplexity AI',
    tier: 'emerging',
    category: 'AI/ML',
    description: 'AI-powered search',
    infra: 'AWS, custom inference',
    data: 'Custom web index, vector stores',
    backend: 'Python, Rust',
    frontend: 'React, Next.js',
  },
  {
    name: 'Cohere',
    tier: 'emerging',
    category: 'AI/ML',
    description: 'Enterprise AI platform',
    infra: 'GCP, AWS, custom training',
    ml: 'Command/Embed: Custom transformer models',
    backend: 'Python, Go',
    frontend: 'React',
  },
  {
    name: 'Hugging Face',
    tier: 'emerging',
    category: 'AI/ML',
    description: 'ML community + model hub',
    infra: 'AWS, custom GPU clusters',
    data: 'Custom model registry, dataset hosting',
    backend: 'Python, Rust (tokenizers, safetensors)',
    frontend: 'Svelte, React',
  },
  {
    name: 'Scale AI',
    tier: 'emerging',
    category: 'AI/ML',
    description: 'Data labeling + AI infrastructure',
    infra: 'AWS, GCP, Kubernetes',
    data: 'Custom labeling pipelines, PostgreSQL',
    backend: 'Python, Go, TypeScript',
    frontend: 'React',
  },
  {
    name: 'Weights & Biases',
    tier: 'emerging',
    category: 'AI/ML',
    description: 'ML experiment tracking',
    infra: 'GCP, Kubernetes',
    data: 'Custom time-series, S3',
    backend: 'Go, Python',
    frontend: 'React',
  },
  {
    name: 'Anyscale',
    tier: 'emerging',
    category: 'AI/ML',
    description: 'Distributed computing',
    infra: 'AWS, GCP',
    ml: 'Created Ray (distributed framework)',
    backend: 'Python, C++, Java',
    frontend: 'React',
  },
  {
    name: 'Replicate',
    tier: 'emerging',
    category: 'AI/ML',
    description: 'ML model hosting',
    infra: 'Custom GPU fleet, Kubernetes',
    data: 'Custom model registry',
    backend: 'Go, Python',
    frontend: 'React, Next.js',
  },
  {
    name: 'Vercel',
    tier: 'emerging',
    category: 'DevTools',
    description: 'Frontend deployment platform',
    infra: 'AWS, Cloudflare, custom edge',
    ml: 'Created Next.js',
    backend: 'Node.js, Go, Rust',
    frontend: 'Next.js, React',
  },
  {
    name: 'Supabase',
    tier: 'emerging',
    category: 'DevTools',
    description: 'Open source Firebase alternative',
    infra: 'AWS, Fly.io',
    data: 'PostgreSQL, GoTrue, PostgREST, Realtime',
    backend: 'Elixir, Go, TypeScript',
    frontend: 'React, Next.js',
  },
  {
    name: 'PlanetScale',
    tier: 'emerging',
    category: 'DevTools',
    description: 'Serverless MySQL platform',
    infra: 'AWS, custom',
    data: 'Built on Vitess (YouTube\'s MySQL scaling)',
    backend: 'Go, Ruby',
    frontend: 'React, Next.js',
  },
  {
    name: 'Neon',
    tier: 'emerging',
    category: 'DevTools',
    description: 'Serverless Postgres',
    infra: 'AWS, custom',
    data: 'Custom Pageserver (Rust), compute/storage separation',
    backend: 'Rust, Python',
    frontend: 'React',
  },
  {
    name: 'Temporal',
    tier: 'emerging',
    category: 'DevTools',
    description: 'Workflow orchestration',
    infra: 'Custom, Kubernetes',
    data: 'Created Temporal (durable execution)',
    backend: 'Go (server), SDKs in Go/Java/Python/TypeScript',
    frontend: 'React',
  },
  {
    name: 'LaunchDarkly',
    tier: 'emerging',
    category: 'DevTools',
    description: 'Feature flag management',
    infra: 'AWS, GCP, Kubernetes',
    data: 'DynamoDB, Redis, Kinesis',
    backend: 'Go, Java',
    frontend: 'React',
  },
  {
    name: 'Linear',
    tier: 'emerging',
    category: 'DevTools',
    description: 'Issue tracking',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Redis',
    backend: 'TypeScript, Rust',
    frontend: 'React (custom sync engine)',
  },
  {
    name: 'Retool',
    tier: 'emerging',
    category: 'DevTools',
    description: 'Internal tools builder',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Redis',
    backend: 'Node.js, TypeScript, Go',
    frontend: 'React',
  },
  {
    name: 'Wiz',
    tier: 'emerging',
    category: 'Security',
    description: 'Cloud security platform',
    infra: 'AWS, Azure, GCP (scans all three)',
    data: 'Custom graph (cloud resource relationships)',
    backend: 'Python, Go',
    frontend: 'React',
  },
  {
    name: 'SentinelOne',
    tier: 'emerging',
    category: 'Security',
    description: 'AI-powered security',
    infra: 'AWS, custom AI (Purple AI, Singularity)',
    data: 'Custom data lake (Singularity Data Lake)',
    backend: 'C++, Python, Go',
    frontend: 'React',
  },
  {
    name: 'Lacework',
    tier: 'emerging',
    category: 'Security',
    description: 'Cloud security',
    infra: 'AWS, Kubernetes',
    data: 'Snowflake, custom graph',
    backend: 'Go, Python',
    frontend: 'React',
  },
  {
    name: 'Chainalysis',
    tier: 'emerging',
    category: 'Security',
    description: 'Blockchain compliance',
    infra: 'AWS, Kubernetes',
    data: 'Custom blockchain indexers, PostgreSQL, Neo4j',
    backend: 'Kotlin, Python, TypeScript',
    frontend: 'React',
  },
  {
    name: 'Feedzai',
    tier: 'emerging',
    category: 'Security',
    description: 'AI fraud prevention',
    infra: 'AWS, Kubernetes',
    data: 'Kafka, Cassandra, Elasticsearch',
    ml: 'Real-time scoring <10ms latency, custom AutoML',
    backend: 'Java, Python, Scala',
    frontend: 'React',
  },
  {
    name: 'Sardine',
    tier: 'emerging',
    category: 'Security',
    description: 'Fraud + compliance',
    infra: 'Custom real-time pipeline',
    data: 'Device intelligence + behavioral biometrics',
    backend: 'Go, Python',
    frontend: 'React',
  },
  {
    name: 'Ramp',
    tier: 'emerging',
    category: 'Fintech',
    description: 'Corporate cards + spend management',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Redis, Kafka',
    backend: 'Python, Go, Elixir',
    frontend: 'React, TypeScript',
  },
  {
    name: 'Brex',
    tier: 'emerging',
    category: 'Fintech',
    description: 'Business finance platform',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Kafka, Elasticsearch',
    backend: 'Elixir, Kotlin, TypeScript',
    frontend: 'React',
  },
  {
    name: 'Mercury',
    tier: 'emerging',
    category: 'Fintech',
    description: 'Banking for startups',
    infra: 'AWS',
    data: 'PostgreSQL, Redis',
    backend: 'Haskell, TypeScript',
    frontend: 'React',
  },
  {
    name: 'Roblox',
    tier: 'emerging',
    category: 'Gaming',
    description: 'Gaming platform + engine',
    infra: 'Custom data centers + AWS',
    data: 'Custom, Consul, Redis, MySQL',
    backend: 'C++, Lua, Go, Rust',
    frontend: 'Custom (Luau engine)',
  },
  {
    name: 'Epic Games',
    tier: 'emerging',
    category: 'Gaming',
    description: 'Unreal Engine + gaming',
    infra: 'AWS, custom',
    data: 'Unreal Engine: C++, custom tools',
    backend: 'C++, Go, Python',
    frontend: 'Custom, React (web)',
  },
  {
    name: 'Unity',
    tier: 'emerging',
    category: 'Gaming',
    description: 'Game engine + tools',
    infra: 'GCP, AWS',
    data: 'Unity Engine: C#, C++, custom runtime',
    backend: 'C#, C++, Go',
    frontend: 'Custom (IMGUI)',
  },
  {
    name: 'Moderna',
    tier: 'emerging',
    category: 'Health',
    description: 'Biotech / mRNA therapeutics',
    infra: 'AWS',
    data: 'Custom bioinformatics, S3',
    ml: 'Custom ML drug design pipelines',
    backend: 'Python, R',
    frontend: 'React',
  },
  {
    name: 'Tempus',
    tier: 'emerging',
    category: 'Health',
    description: 'Precision medicine',
    infra: 'GCP, custom',
    data: 'Genomic data pipelines, BigQuery',
    backend: 'Python, Go',
    frontend: 'React',
  },
  {
    name: 'Nubank',
    tier: 'emerging',
    category: 'Fintech',
    description: 'Digital banking (LatAm)',
    infra: 'AWS, Kubernetes, Datomic',
    data: 'Kafka, Spark, S3',
    backend: 'Clojure, Kotlin, Python',
    frontend: 'React Native, Flutter',
  },
  {
    name: 'Mercado Libre',
    tier: 'emerging',
    category: 'E-Commerce',
    description: 'LatAm marketplace',
    infra: 'AWS, custom data centers, Kubernetes',
    data: 'Kafka, Spark, Cassandra, Elasticsearch',
    backend: 'Java, Go, Groovy',
    frontend: 'React',
  },
  {
    name: 'Grab',
    tier: 'emerging',
    category: 'Mobility',
    description: 'Southeast Asian super app',
    infra: 'AWS, Kubernetes',
    data: 'Kafka, Spark, Presto, custom feature store',
    backend: 'Go, Java, Python',
    frontend: 'React Native',
  },
  {
    name: 'Gojek',
    tier: 'emerging',
    category: 'Mobility',
    description: 'Indonesian super app',
    infra: 'GCP, Kubernetes',
    data: 'Kafka, BigQuery, custom ML platform (Merlin)',
    backend: 'Go, Clojure, Java',
    frontend: 'React Native',
  },
  {
    name: 'Wise (TransferWise)',
    tier: 'emerging',
    category: 'Fintech',
    description: 'International transfers',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Kafka, custom risk engine',
    backend: 'Java, Kotlin',
    frontend: 'React',
  },
  {
    name: 'Klarna',
    tier: 'emerging',
    category: 'Fintech',
    description: 'Buy now pay later',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Kafka, custom ML fraud detection',
    backend: 'Java, Python, Node.js',
    frontend: 'React Native',
  },
  {
    name: 'N26',
    tier: 'emerging',
    category: 'Fintech',
    description: 'Digital banking (EU)',
    infra: 'AWS, Kubernetes',
    data: 'PostgreSQL, Kafka, Redis',
    backend: 'Kotlin, Python',
    frontend: 'React Native',
  },
  {
    name: 'Monzo',
    tier: 'emerging',
    category: 'Fintech',
    description: 'Digital banking (UK)',
    infra: 'AWS, Kubernetes, Linkerd service mesh',
    data: 'Cassandra, Kafka, NSQ, custom event sourcing',
    backend: 'Go (microservices, 2500+)',
    frontend: 'React Native',
  },
];

const STACK_FIELDS = [
  { key: 'infra', label: 'Infra', color: 'text-blue-400' },
  { key: 'data', label: 'Data', color: 'text-green-400' },
  { key: 'ml', label: 'ML/AI', color: 'text-purple-400' },
  { key: 'backend', label: 'Backend', color: 'text-yellow-400' },
  { key: 'frontend', label: 'Frontend', color: 'text-pink-400' },
];

function computeTopTechnologies(companies) {
  const counts = {};
  const stackKeys = ['infra', 'data', 'ml', 'backend', 'frontend'];
  companies.forEach((c) => {
    stackKeys.forEach((key) => {
      const val = c[key];
      if (!val) return;
      val.split(/,\s*/).forEach((tech) => {
        const cleaned = tech
          .replace(/\(.*?\)/g, '')
          .replace(/→/g, '')
          .trim();
        if (cleaned && cleaned.length > 1 && !/^\d/.test(cleaned)) {
          const k = cleaned.toLowerCase();
          if (!counts[k]) counts[k] = { name: cleaned, count: 0 };
          counts[k].count++;
        }
      });
    });
    if (c.flagships) {
      c.flagships.forEach((f) => {
        f.stack.split(/,\s*/).forEach((tech) => {
          const cleaned = tech.replace(/\(.*?\)/g, '').replace(/→/g, '').trim();
          if (cleaned && cleaned.length > 1 && !/^\d/.test(cleaned)) {
            const k = cleaned.toLowerCase();
            if (!counts[k]) counts[k] = { name: cleaned, count: 0 };
            counts[k].count++;
          }
        });
      });
    }
  });
  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

function tierCounts(tier) {
  if (tier === 'All') return COMPANIES.length;
  const map = { 'Big Tech': 'big-tech', 'Scale-ups': 'scale-up', 'Emerging': 'emerging' };
  return COMPANIES.filter((c) => c.tier === map[tier]).length;
}

function CompanyCard({ company }) {
  const tierBadge = TIER_BADGE[company.tier] || '';
  const catBadge = CATEGORY_COLORS[company.category] || 'bg-gray-800 text-gray-300 border-gray-700';

  return (
    <div className="bg-[#12121a] border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-1.5">
        <h3 className="text-white font-semibold text-base leading-tight">{company.name}</h3>
        <div className="flex gap-1.5 ml-2 flex-shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${tierBadge} whitespace-nowrap`}>
            {TIER_LABEL[company.tier]}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${catBadge} whitespace-nowrap`}>
            {company.category}
          </span>
        </div>
      </div>
      <p className="text-gray-500 text-xs mb-3">{company.description}</p>

      {/* Flagship products (Big Tech only) */}
      {company.flagships && (
        <div className="mb-2.5 space-y-1.5">
          {company.flagships.map((f) => (
            <div key={f.product} className="bg-[#0a0a12] rounded px-2.5 py-1.5 border border-gray-800/60">
              <span className="text-amber-400 text-[11px] font-medium">{f.product}: </span>
              <span className="text-gray-300 text-[11px]">{f.stack}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stack fields */}
      <div className="space-y-1">
        {STACK_FIELDS.map(({ key, label, color }) => {
          const value = company[key];
          if (!value) return null;
          return (
            <div key={key} className="flex items-start gap-1">
              <span className={`text-[11px] font-medium ${color} flex-shrink-0 w-[52px]`}>{label}:</span>
              <span className="text-gray-400 text-[11px] leading-relaxed">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function IndustryTechStacks() {
  const [search, setSearch] = useState('');
  const [activeTier, setActiveTier] = useState('All');
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered = useMemo(() => {
    const tierMap = { 'Big Tech': 'big-tech', 'Scale-ups': 'scale-up', 'Emerging': 'emerging' };
    return COMPANIES.filter((c) => {
      if (activeTier !== 'All' && c.tier !== tierMap[activeTier]) return false;
      if (activeCategory !== 'All' && c.category !== activeCategory) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const parts = [
        c.name, c.description, c.category, c.tier,
        c.infra, c.data, c.ml, c.backend, c.frontend,
      ].filter(Boolean);
      if (c.flagships) {
        c.flagships.forEach((f) => { parts.push(f.product); parts.push(f.stack); });
      }
      return parts.join(' ').toLowerCase().includes(q);
    });
  }, [search, activeTier, activeCategory]);

  const topTech = useMemo(() => computeTopTechnologies(COMPANIES), []);

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-1">Industry Tech Stacks</h1>
          <p className="text-gray-400">
            How {COMPANIES.length} top technology companies build their platforms
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search companies or technologies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#12121a] border border-gray-800 rounded-lg pl-10 pr-10 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-600"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Tier Filter Pills */}
        <div className="flex flex-wrap gap-2 mb-3">
          {TIERS.map((tier) => (
            <button
              key={tier}
              onClick={() => setActiveTier(tier)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeTier === tier
                  ? 'bg-white text-black'
                  : 'bg-[#12121a] text-gray-400 border border-gray-800 hover:text-gray-200 hover:border-gray-600'
              }`}
            >
              {tier} ({tierCounts(tier)})
            </button>
          ))}
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-white text-black'
                  : 'bg-[#12121a] text-gray-400 border border-gray-800 hover:text-gray-200 hover:border-gray-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results Count */}
        <p className="text-gray-500 text-sm mb-4">
          Showing {filtered.length} of {COMPANIES.length} companies
        </p>

        {/* Company Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-12">
          {filtered.map((company) => (
            <CompanyCard key={company.name} company={company} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No companies match your search.</p>
            <p className="text-sm mt-1">Try a different search term or filter.</p>
          </div>
        )}

        {/* Most Used Technologies */}
        <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Most Used Technologies</h2>
          <p className="text-gray-400 text-sm mb-4">
            Top 15 technologies across all {COMPANIES.length} companies
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topTech.map((tech, i) => (
              <div key={tech.name} className="flex items-center gap-3">
                <span className="text-gray-600 text-sm font-mono w-5 text-right">{i + 1}.</span>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-gray-200 text-sm">{tech.name}</span>
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(tech.count / topTech[0].count) * 100}%` }}
                    />
                  </div>
                  <span className="text-gray-500 text-xs">{tech.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
