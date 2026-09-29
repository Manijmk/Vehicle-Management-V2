import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export interface ObservabilityConfig {
  readonly enabled: boolean;
  readonly serviceName: string;
  readonly otlpEndpoint: string;
}

export interface ObservabilityHandle {
  shutdown(): Promise<void>;
}

const disabledHandle: ObservabilityHandle = {
  shutdown: () => Promise.resolve(),
};

export function startObservability(config: ObservabilityConfig): ObservabilityHandle {
  if (!config.enabled) {
    return disabledHandle;
  }

  const endpoint = config.otlpEndpoint.replace(/\/$/u, '');
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  return {
    shutdown: () => sdk.shutdown(),
  };
}
