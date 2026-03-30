/**
 * OpenTelemetry SDK setup — distributed tracing.
 * Exports traces to OTLP endpoint (Langfuse, Jaeger, or any OTLP collector).
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

let sdk = null;

export function initTelemetry() {
  if (sdk) return;

  try {
    const exporter = new OTLPTraceExporter({
      url: `${OTEL_ENDPOINT}/v1/traces`,
      headers: {}
    });

    sdk = new NodeSDK({
      resource: new Resource({
        'service.name': 'fraud-detection-platform',
        'service.version': '2.0.0'
      }),
      traceExporter: exporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-express': { enabled: true },
          '@opentelemetry/instrumentation-fs': { enabled: false }
        })
      ]
    });

    sdk.start();
    console.log('[otel] OpenTelemetry SDK initialized, exporting to', OTEL_ENDPOINT);
  } catch (err) {
    console.warn('[otel] OpenTelemetry init failed (non-critical):', err.message);
  }
}

export function shutdownTelemetry() {
  if (sdk) {
    sdk.shutdown().catch(err => console.warn('[otel] Shutdown error:', err.message));
  }
}

export default { initTelemetry, shutdownTelemetry };
