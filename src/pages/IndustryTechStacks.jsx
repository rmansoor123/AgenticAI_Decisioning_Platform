import { useState, useMemo } from 'react';
import { Search, Server, Database, Brain, Code, Monitor, Layout, X } from 'lucide-react';

const CATEGORIES = [
  'All',
  'Fintech/Payments',
  'E-Commerce',
  'Social/Consumer',
  'Cloud/Infrastructure',
  'AI/ML',
  'Cybersecurity',
  'Enterprise',
  'Streaming/Media',
  'Mobility/Logistics',
  'Developer Tools',
];

const LAYER_CONFIG = {
  infra: { label: 'Infrastructure', icon: Server, color: 'text-blue-400' },
  data: { label: 'Data', icon: Database, color: 'text-green-400' },
  ml: { label: 'ML/AI', icon: Brain, color: 'text-purple-400' },
  backend: { label: 'Backend', icon: Code, color: 'text-yellow-400' },
  frontend: { label: 'Frontend', icon: Layout, color: 'text-pink-400' },
  observability: { label: 'Observability', icon: Monitor, color: 'text-cyan-400' },
};

const COMPANIES = [
  // Fintech & Payments
  {
    name: 'Stripe',
    category: 'Fintech/Payments',
    description: 'Payment infrastructure',
    stack: {
      infra: 'AWS, Kubernetes, Envoy proxy',
      data: 'Apache Kafka, Apache Spark, Presto, S3 data lake',
      ml: 'Ruby ML models, scikit-learn, real-time fraud scoring',
      backend: 'Ruby, Java, Go',
      frontend: 'React, Flow',
      observability: 'Custom (Veneur metrics), PagerDuty',
    },
  },
  {
    name: 'Square/Block',
    category: 'Fintech/Payments',
    description: 'Financial services',
    stack: {
      infra: 'AWS, GCP, Kubernetes',
      data: 'Kafka, Spark, BigQuery, Snowflake',
      ml: 'TensorFlow, PyTorch, real-time fraud detection',
      backend: 'Java, Kotlin, Go, Ruby',
      frontend: 'React, Swift, Kotlin',
      observability: 'Datadog, PagerDuty',
    },
  },
  {
    name: 'PayPal',
    category: 'Fintech/Payments',
    description: 'Digital payments',
    stack: {
      infra: 'Private cloud + GCP, Kubernetes',
      data: 'Kafka, Hadoop, Teradata, Apache Giraph',
      ml: 'TensorFlow, custom fraud models, graph analytics',
      backend: 'Java, Node.js, C++',
      frontend: 'React, Backbone.js',
      observability: 'Splunk, custom monitoring',
    },
  },
  {
    name: 'Plaid',
    category: 'Fintech/Payments',
    description: 'Financial data API',
    stack: {
      infra: 'AWS, Kubernetes, Terraform',
      data: 'PostgreSQL, DynamoDB, Kafka, Elasticsearch',
      ml: 'Python ML pipelines, identity verification',
      backend: 'Go, Python, TypeScript',
      frontend: 'React, TypeScript',
      observability: 'Datadog, LaunchDarkly',
    },
  },
  {
    name: 'Revolut',
    category: 'Fintech/Payments',
    description: 'Digital banking',
    stack: {
      infra: 'AWS, GCP, Kubernetes',
      data: 'PostgreSQL, Kafka, BigQuery, Redis',
      ml: 'TensorFlow, fraud detection, credit scoring',
      backend: 'Java, Kotlin, Python',
      frontend: 'React Native, Swift, Kotlin',
      observability: 'Grafana, Prometheus',
    },
  },
  {
    name: 'Adyen',
    category: 'Fintech/Payments',
    description: 'Payment platform',
    stack: {
      infra: 'Private data centers, bare metal',
      data: 'Custom event streaming, MySQL',
      ml: 'Custom fraud prevention (RevenueProtect)',
      backend: 'Java (99% of codebase)',
      frontend: 'React',
      observability: 'Custom built',
    },
  },
  {
    name: 'Nubank',
    category: 'Fintech/Payments',
    description: 'Digital banking (LatAm)',
    stack: {
      infra: 'AWS, Kubernetes, Datomic',
      data: 'Kafka, Apache Spark, S3',
      ml: 'Clojure-based ML, real-time fraud',
      backend: 'Clojure, Kotlin, Python',
      frontend: 'React Native, Flutter',
      observability: 'Prometheus, Grafana',
    },
  },
  // E-Commerce & Marketplace
  {
    name: 'Amazon',
    category: 'E-Commerce',
    description: 'Everything store',
    stack: {
      infra: 'AWS (built their own), custom hardware',
      data: 'DynamoDB, Redshift, Kinesis, S3, EMR',
      ml: 'SageMaker, custom recommendation engines, fraud detection',
      backend: 'Java, Python, Go, Rust',
      frontend: 'React, custom frameworks',
      observability: 'CloudWatch, X-Ray, custom tools',
    },
  },
  {
    name: 'Shopify',
    category: 'E-Commerce',
    description: 'E-commerce platform',
    stack: {
      infra: 'GCP, Kubernetes, custom CDN',
      data: 'MySQL, Kafka, Apache Flink, BigQuery',
      ml: 'Ruby ML, TensorFlow, fraud detection',
      backend: 'Ruby on Rails, Go, Rust',
      frontend: 'React, Polaris design system',
      observability: 'Datadog, custom tools',
    },
  },
  {
    name: 'Alibaba',
    category: 'E-Commerce',
    description: 'Chinese e-commerce',
    stack: {
      infra: 'Alibaba Cloud, custom hardware',
      data: 'OceanBase (custom DB), Flink, MaxCompute',
      ml: 'PAI (custom ML platform), real-time recommendations',
      backend: 'Java (Spring), Go, Rust',
      frontend: 'React, AntD design system',
      observability: 'Custom (ARMS)',
    },
  },
  {
    name: 'Mercado Libre',
    category: 'E-Commerce',
    description: 'LatAm marketplace',
    stack: {
      infra: 'AWS, custom data centers, Kubernetes',
      data: 'Kafka, Spark, Cassandra, Elasticsearch',
      ml: 'TensorFlow, fraud prevention, pricing',
      backend: 'Java, Go, Groovy',
      frontend: 'React',
      observability: 'Datadog, New Relic',
    },
  },
  {
    name: 'eBay',
    category: 'E-Commerce',
    description: 'Online marketplace',
    stack: {
      infra: 'Private cloud + GCP, Kubernetes',
      data: 'Kafka, Hadoop, Druid, Elasticsearch',
      ml: 'TensorFlow, fraud detection, search ranking',
      backend: 'Java, Node.js, Python',
      frontend: 'Marko.js (custom), React',
      observability: 'Splunk, Grafana',
    },
  },
  {
    name: 'Etsy',
    category: 'E-Commerce',
    description: 'Handmade marketplace',
    stack: {
      infra: 'GCP, Kubernetes',
      data: 'MySQL, Kafka, BigQuery, Elasticsearch',
      ml: 'TensorFlow, search ranking, fraud detection',
      backend: 'PHP, Java, Go',
      frontend: 'React, custom components',
      observability: 'Datadog, custom (Statsd)',
    },
  },
  // Social & Consumer
  {
    name: 'Meta',
    category: 'Social/Consumer',
    description: 'Social network',
    stack: {
      infra: 'Custom data centers, custom hardware',
      data: 'MySQL, RocksDB, Scuba, Presto, Spark',
      ml: 'PyTorch (created it), custom recommendation systems',
      backend: 'Hack (PHP), C++, Python, Rust',
      frontend: 'React (created it), React Native',
      observability: 'Custom (Scuba, ODS)',
    },
  },
  {
    name: 'X (Twitter)',
    category: 'Social/Consumer',
    description: 'Social platform',
    stack: {
      infra: 'GCP + on-prem, Kubernetes (Mesos migration)',
      data: 'Manhattan (custom KV), Kafka, BigQuery, Vertica',
      ml: 'Custom ML (timeline ranking, trust & safety)',
      backend: 'Scala, Java, Python, Go',
      frontend: 'React, Node.js',
      observability: 'Splunk, Grafana, custom',
    },
  },
  {
    name: 'TikTok/ByteDance',
    category: 'Social/Consumer',
    description: 'Short video',
    stack: {
      infra: 'Multi-cloud, custom CDN',
      data: 'Custom storage, Kafka, ClickHouse, RocksDB',
      ml: 'Custom recommendation engine (one of the best in industry)',
      backend: 'Go, Python, Java',
      frontend: 'React, custom mobile frameworks',
      observability: 'Custom built',
    },
  },
  {
    name: 'Snap',
    category: 'Social/Consumer',
    description: 'Camera/messaging',
    stack: {
      infra: 'GCP, Kubernetes',
      data: 'BigQuery, Spanner, Pub/Sub, Bigtable',
      ml: 'TensorFlow, AR/ML on-device',
      backend: 'Go, Java, Python',
      frontend: 'Custom mobile (Swift, Kotlin)',
      observability: 'Datadog',
    },
  },
  {
    name: 'Pinterest',
    category: 'Social/Consumer',
    description: 'Visual discovery',
    stack: {
      infra: 'AWS, Kubernetes',
      data: 'MySQL, HBase, Kafka, Druid, S3',
      ml: 'PyTorch, visual search, recommendation',
      backend: 'Python (Django), Java, Go, Elixir',
      frontend: 'React, Gestalt design system',
      observability: 'Custom, Datadog',
    },
  },
  {
    name: 'Reddit',
    category: 'Social/Consumer',
    description: 'Community platform',
    stack: {
      infra: 'AWS, Kubernetes',
      data: 'PostgreSQL, Cassandra, Kafka, Apache Druid',
      ml: 'TensorFlow, content ranking, safety',
      backend: 'Python, Go, Rust',
      frontend: 'React, TypeScript',
      observability: 'Datadog, PagerDuty',
    },
  },
  {
    name: 'Discord',
    category: 'Social/Consumer',
    description: 'Communication platform',
    stack: {
      infra: 'GCP, Kubernetes',
      data: 'Cassandra → ScyllaDB, Kafka, Elasticsearch',
      ml: 'Python ML, trust & safety',
      backend: 'Rust, Python, Elixir, Go',
      frontend: 'React, React Native, Electron',
      observability: 'Datadog',
    },
  },
  // Cloud & Infrastructure
  {
    name: 'Google Cloud',
    category: 'Cloud/Infrastructure',
    description: 'Cloud platform',
    stack: {
      infra: 'Custom hardware, Borg (precursor to K8s)',
      data: 'Bigtable, Spanner, BigQuery, Pub/Sub, Dataflow',
      ml: 'TensorFlow (created it), Vertex AI, TPUs',
      backend: 'C++, Java, Go, Python',
      frontend: 'Angular, Lit',
      observability: 'Cloud Monitoring, Cloud Trace',
    },
  },
  {
    name: 'Microsoft Azure',
    category: 'Cloud/Infrastructure',
    description: 'Cloud platform',
    stack: {
      infra: 'Custom data centers, Azure Service Fabric',
      data: 'Cosmos DB, Azure Synapse, Event Hubs, SQL Server',
      ml: 'Azure ML, Cognitive Services, OpenAI integration',
      backend: 'C#, .NET, TypeScript, Rust',
      frontend: 'React, Fluent UI',
      observability: 'Azure Monitor, Application Insights',
    },
  },
  {
    name: 'Cloudflare',
    category: 'Cloud/Infrastructure',
    description: 'Edge computing',
    stack: {
      infra: 'Custom hardware in 300+ cities',
      data: 'ClickHouse, Kafka, PostgreSQL, custom KV store',
      ml: 'Custom threat detection, bot management',
      backend: 'Rust, Go, C, Lua',
      frontend: 'React, TypeScript',
      observability: 'Prometheus, Grafana, custom',
    },
  },
  {
    name: 'Datadog',
    category: 'Cloud/Infrastructure',
    description: 'Observability platform',
    stack: {
      infra: 'AWS + GCP, Kubernetes',
      data: 'Kafka, Cassandra, custom time-series DB',
      ml: 'Anomaly detection, log pattern analysis',
      backend: 'Go, Python, Java',
      frontend: 'React, D3.js',
      observability: 'Datadog (dogfooding)',
    },
  },
  {
    name: 'HashiCorp',
    category: 'Cloud/Infrastructure',
    description: 'Infrastructure tools',
    stack: {
      infra: 'AWS, GCP, Azure',
      data: 'Consul (service mesh), Vault (secrets)',
      ml: 'Minimal ML use',
      backend: 'Go (100% for OSS tools)',
      frontend: 'Ember.js, React',
      observability: 'Custom, Prometheus',
    },
  },
  {
    name: 'Snowflake',
    category: 'Cloud/Infrastructure',
    description: 'Data cloud',
    stack: {
      infra: 'AWS, Azure, GCP (multi-cloud from day 1)',
      data: 'Custom columnar storage, S3/Blob/GCS',
      ml: 'Snowpark (Python/Java/Scala in Snowflake)',
      backend: 'C++, Java, Python',
      frontend: 'React, TypeScript',
      observability: 'Custom, Datadog',
    },
  },
  // AI & ML Companies
  {
    name: 'OpenAI',
    category: 'AI/ML',
    description: 'AI research',
    stack: {
      infra: 'Azure (exclusive partnership), custom GPU clusters',
      data: 'Custom training data pipelines, distributed storage',
      ml: 'Custom transformer models, RLHF, GPT architecture',
      backend: 'Python, Rust, Go',
      frontend: 'React, Next.js',
      observability: 'Custom',
    },
  },
  {
    name: 'Anthropic',
    category: 'AI/ML',
    description: 'AI safety',
    stack: {
      infra: 'AWS, GCP, custom GPU clusters',
      data: 'Custom data pipelines',
      ml: 'Constitutional AI, Claude models, custom training',
      backend: 'Python, Rust, TypeScript',
      frontend: 'React, TypeScript',
      observability: 'Custom',
    },
  },
  {
    name: 'Databricks',
    category: 'AI/ML',
    description: 'Data + AI platform',
    stack: {
      infra: 'AWS, Azure, GCP',
      data: 'Delta Lake (created it), Apache Spark (created it), Unity Catalog',
      ml: 'MLflow (created it), custom ML runtime',
      backend: 'Scala, Python, Go',
      frontend: 'React, TypeScript',
      observability: 'Custom, Datadog',
    },
  },
  {
    name: 'Hugging Face',
    category: 'AI/ML',
    description: 'ML community',
    stack: {
      infra: 'AWS, custom GPU clusters',
      data: 'Datasets library, Hub storage',
      ml: 'Transformers library, model hub, Inference API',
      backend: 'Python, Rust (tokenizers, safetensors)',
      frontend: 'Svelte, React',
      observability: 'Custom',
    },
  },
  {
    name: 'Scale AI',
    category: 'AI/ML',
    description: 'Data labeling + AI',
    stack: {
      infra: 'AWS, GCP, Kubernetes',
      data: 'Custom labeling pipelines, PostgreSQL',
      ml: 'Custom quality models, active learning',
      backend: 'Python, Go, TypeScript',
      frontend: 'React, TypeScript',
      observability: 'Datadog',
    },
  },
  // Cybersecurity & Fraud
  {
    name: 'CrowdStrike',
    category: 'Cybersecurity',
    description: 'Endpoint security',
    stack: {
      infra: 'AWS, custom cloud (Falcon platform)',
      data: 'Kafka, Cassandra, Elasticsearch, custom graph DB',
      ml: 'Custom threat detection models, behavioral AI',
      backend: 'Go, Python, C++',
      frontend: 'React, Ember.js',
      observability: 'Custom (Humio, which they acquired)',
    },
  },
  {
    name: 'Palo Alto Networks',
    category: 'Cybersecurity',
    description: 'Network security',
    stack: {
      infra: 'GCP, AWS, custom appliances',
      data: 'Cortex Data Lake, custom SIEM',
      ml: 'ML-powered threat detection, AutoFocus',
      backend: 'Python, Go, C/C++',
      frontend: 'React',
      observability: 'Custom (Cortex XSOAR)',
    },
  },
  {
    name: 'Chainalysis',
    category: 'Cybersecurity',
    description: 'Blockchain compliance',
    stack: {
      infra: 'AWS, Kubernetes',
      data: 'Custom blockchain indexers, PostgreSQL, Neo4j',
      ml: 'Graph ML, transaction clustering, entity resolution',
      backend: 'Kotlin, Python, TypeScript',
      frontend: 'React, TypeScript',
      observability: 'Datadog',
    },
  },
  {
    name: 'Feedzai',
    category: 'Cybersecurity',
    description: 'AI fraud prevention',
    stack: {
      infra: 'AWS, Kubernetes',
      data: 'Kafka, Cassandra, Elasticsearch',
      ml: 'Custom AutoML, real-time scoring (<10ms)',
      backend: 'Java, Python, Scala',
      frontend: 'React',
      observability: 'Custom, Grafana',
    },
  },
  // Enterprise & SaaS
  {
    name: 'Salesforce',
    category: 'Enterprise',
    description: 'CRM platform',
    stack: {
      infra: 'Private cloud + AWS, Kubernetes',
      data: 'Oracle DB, PostgreSQL, Apache Kafka, custom',
      ml: 'Einstein AI, custom NLP models',
      backend: 'Java (Apex), Python, Go',
      frontend: 'Lightning Web Components, React',
      observability: 'Custom (Argus)',
    },
  },
  {
    name: 'Slack',
    category: 'Enterprise',
    description: 'Business messaging',
    stack: {
      infra: 'AWS, Kubernetes',
      data: 'MySQL (Vitess), Kafka, Redis, Elasticsearch, S3',
      ml: 'Search ranking, spam detection, channel recommendations',
      backend: 'Java, Go, PHP (legacy), Hack',
      frontend: 'React, Electron',
      observability: 'Custom, Datadog',
    },
  },
  {
    name: 'Atlassian',
    category: 'Enterprise',
    description: 'Dev tools (Jira, Confluence)',
    stack: {
      infra: 'AWS, Kubernetes',
      data: 'PostgreSQL, DynamoDB, Kafka, Elasticsearch',
      ml: 'AI assistants, issue classification',
      backend: 'Java, Kotlin, Python, Go',
      frontend: 'React, Atlaskit design system',
      observability: 'Datadog, Opsgenie (own product)',
    },
  },
  {
    name: 'Twilio',
    category: 'Enterprise',
    description: 'Communications API',
    stack: {
      infra: 'AWS, Kubernetes',
      data: 'MySQL, Redis, Kafka, CockroachDB',
      ml: 'Fraud detection, voice analysis',
      backend: 'Java, Python, Go, PHP',
      frontend: 'React, Paste design system',
      observability: 'Custom, Datadog',
    },
  },
  {
    name: 'Figma',
    category: 'Enterprise',
    description: 'Design tool',
    stack: {
      infra: 'AWS, Kubernetes',
      data: 'PostgreSQL, Redis, S3',
      ml: 'AI features (auto-layout, component suggestions)',
      backend: 'TypeScript, Rust, C++ (rendering engine)',
      frontend: 'Custom (WebGL/Canvas), React',
      observability: 'Datadog',
    },
  },
  // Streaming & Media
  {
    name: 'Netflix',
    category: 'Streaming/Media',
    description: 'Streaming platform',
    stack: {
      infra: 'AWS (largest customer), custom CDN (Open Connect)',
      data: 'Cassandra, CockroachDB, Kafka, Apache Iceberg, Spark',
      ml: 'Custom recommendation engine, content personalization',
      backend: 'Java (Spring Boot), Python, Go, Node.js',
      frontend: 'React',
      observability: 'Atlas (custom), Mantis (stream processing)',
    },
  },
  {
    name: 'Spotify',
    category: 'Streaming/Media',
    description: 'Music streaming',
    stack: {
      infra: 'GCP, Kubernetes',
      data: 'BigQuery, Bigtable, Pub/Sub, Apache Beam, Cloud Dataflow',
      ml: 'TensorFlow, custom recommendation (Discover Weekly)',
      backend: 'Java, Python, Go',
      frontend: 'React, React Native, Backstage (created it)',
      observability: 'Custom, Backstage',
    },
  },
  {
    name: 'YouTube/Google',
    category: 'Streaming/Media',
    description: 'Video streaming',
    stack: {
      infra: 'Google infrastructure, custom hardware',
      data: 'Bigtable, Spanner, Dremel, custom video pipeline',
      ml: 'Deep learning recommendation, content moderation',
      backend: 'C++, Python, Java, Go',
      frontend: 'Polymer → Lit, custom web components',
      observability: 'Dapper (created distributed tracing)',
    },
  },
  // Mobility & Logistics
  {
    name: 'Uber',
    category: 'Mobility/Logistics',
    description: 'Ride sharing',
    stack: {
      infra: 'Multi-cloud + on-prem, Kubernetes (Peloton)',
      data: 'Kafka, Apache Hudi, Presto, Pinot (created it), M3 (metrics)',
      ml: 'Michelangelo (custom ML platform), PyTorch',
      backend: 'Go, Java, Python, Node.js',
      frontend: 'React, Fusion.js',
      observability: 'M3 (custom), Jaeger (created it for tracing)',
    },
  },
  {
    name: 'Lyft',
    category: 'Mobility/Logistics',
    description: 'Ride sharing',
    stack: {
      infra: 'AWS, Kubernetes',
      data: 'Apache Flink, Kafka, Apache Druid, S3',
      ml: 'Flyte (created it, ML orchestration), LyftLearn',
      backend: 'Python, Go, Java, Kotlin',
      frontend: 'React, TypeScript',
      observability: 'Custom, Datadog',
    },
  },
  {
    name: 'DoorDash',
    category: 'Mobility/Logistics',
    description: 'Food delivery',
    stack: {
      infra: 'AWS, Kubernetes',
      data: 'Apache Kafka, Apache Flink, Snowflake, CockroachDB',
      ml: 'Custom ML platform, delivery time prediction, fraud',
      backend: 'Kotlin, Python, Go',
      frontend: 'React, React Native',
      observability: 'Datadog, custom',
    },
  },
  {
    name: 'Instacart',
    category: 'Mobility/Logistics',
    description: 'Grocery delivery',
    stack: {
      infra: 'GCP, Kubernetes',
      data: 'PostgreSQL, Kafka, BigQuery, Redis',
      ml: 'TensorFlow, search ranking, fulfillment optimization',
      backend: 'Ruby on Rails, Python, Go',
      frontend: 'React, React Native',
      observability: 'Datadog',
    },
  },
  // Developer Tools
  {
    name: 'GitHub',
    category: 'Developer Tools',
    description: 'Code hosting',
    stack: {
      infra: 'Azure (Microsoft), Kubernetes',
      data: 'MySQL (Vitess), Redis, Elasticsearch, Kafka',
      ml: 'Copilot (OpenAI), code search, security scanning',
      backend: 'Ruby on Rails, Go, Rust, C',
      frontend: 'React, Web Components, Primer design system',
      observability: 'Datadog, custom (Scientist for experiments)',
    },
  },
  {
    name: 'GitLab',
    category: 'Developer Tools',
    description: 'DevOps platform',
    stack: {
      infra: 'GCP, Kubernetes',
      data: 'PostgreSQL, Redis, ClickHouse, Elasticsearch',
      ml: 'Custom AI (code suggestions, vulnerability detection)',
      backend: 'Ruby on Rails, Go',
      frontend: 'Vue.js, Pajamas design system',
      observability: 'Prometheus, Grafana, custom',
    },
  },
  {
    name: 'Vercel',
    category: 'Developer Tools',
    description: 'Frontend deployment',
    stack: {
      infra: 'AWS, Cloudflare, custom edge network',
      data: 'Custom, Turborepo',
      ml: 'AI SDK, v0 (generative UI)',
      backend: 'Node.js, Go, Rust',
      frontend: 'Next.js (created it), React',
      observability: 'Custom, Vercel Analytics',
    },
  },
];

function computeTopTechnologies(companies) {
  const counts = {};
  companies.forEach((c) => {
    Object.values(c.stack).forEach((val) => {
      val.split(/,\s*/).forEach((tech) => {
        const cleaned = tech
          .replace(/\(.*?\)/g, '')
          .replace(/→/g, '')
          .trim();
        if (cleaned && cleaned.length > 1 && !/^\d/.test(cleaned)) {
          const key = cleaned.toLowerCase();
          if (!counts[key]) counts[key] = { name: cleaned, count: 0 };
          counts[key].count++;
        }
      });
    });
  });
  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

const CATEGORY_COLORS = {
  'Fintech/Payments': 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50',
  'E-Commerce': 'bg-orange-900/50 text-orange-300 border-orange-700/50',
  'Social/Consumer': 'bg-blue-900/50 text-blue-300 border-blue-700/50',
  'Cloud/Infrastructure': 'bg-sky-900/50 text-sky-300 border-sky-700/50',
  'AI/ML': 'bg-purple-900/50 text-purple-300 border-purple-700/50',
  Cybersecurity: 'bg-red-900/50 text-red-300 border-red-700/50',
  Enterprise: 'bg-indigo-900/50 text-indigo-300 border-indigo-700/50',
  'Streaming/Media': 'bg-pink-900/50 text-pink-300 border-pink-700/50',
  'Mobility/Logistics': 'bg-amber-900/50 text-amber-300 border-amber-700/50',
  'Developer Tools': 'bg-teal-900/50 text-teal-300 border-teal-700/50',
};

function CompanyCard({ company }) {
  const badgeClass = CATEGORY_COLORS[company.category] || 'bg-gray-800 text-gray-300 border-gray-700';

  return (
    <div className="bg-[#12121a] border border-gray-800 rounded-lg p-5 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-white font-semibold text-lg">{company.name}</h3>
        <span className={`text-xs px-2 py-0.5 rounded border ${badgeClass} whitespace-nowrap ml-2`}>
          {company.category}
        </span>
      </div>
      <p className="text-gray-400 text-sm mb-4">{company.description}</p>
      <div className="space-y-2">
        {Object.entries(LAYER_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          const value = company.stack[key];
          if (!value) return null;
          return (
            <div key={key} className="flex items-start gap-2">
              <Icon size={14} className={`${config.color} mt-0.5 flex-shrink-0`} />
              <div className="min-w-0">
                <span className={`text-xs font-medium ${config.color}`}>{config.label}: </span>
                <span className="text-gray-300 text-xs">{value}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function IndustryTechStacks() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered = useMemo(() => {
    return COMPANIES.filter((c) => {
      const matchesCategory = activeCategory === 'All' || c.category === activeCategory;
      if (!matchesCategory) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const allText = [c.name, c.description, c.category, ...Object.values(c.stack)]
        .join(' ')
        .toLowerCase();
      return allText.includes(q);
    });
  }, [search, activeCategory]);

  const topTech = useMemo(() => computeTopTechnologies(COMPANIES), []);

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Industry Tech Stacks</h1>
          <p className="text-gray-400 text-lg">
            How the world's top technology companies build their platforms
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
            <p className="text-sm mt-1">Try a different search term or category.</p>
          </div>
        )}

        {/* Most Used Technologies */}
        <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Most Used Technologies</h2>
          <p className="text-gray-400 text-sm mb-4">
            Top technologies across all {COMPANIES.length} companies
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
