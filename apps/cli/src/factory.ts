/**
 * Provider factory — creates ModelProvider adapters from config strings.
 * Used by the CLI to instantiate providers for experiments.
 */
import type { ModelProvider } from '@harnessfit/core';
import { OpenAIProvider } from '@harnessfit/providers-openai';
import { AnthropicProvider } from '@harnessfit/providers-anthropic';
import { GoogleProvider } from '@harnessfit/providers-google';

export interface ProviderConfig {
  readonly provider: 'openai' | 'anthropic' | 'google';
  readonly model: string;
  readonly apiKey?: string;
}

/**
 * Create a ModelProvider from a provider name.
 * API keys are read from environment variables by default,
 * but can be overridden via the apiKey field.
 */
export function createProvider(config: ProviderConfig): ModelProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config.apiKey);
    case 'anthropic':
      return new AnthropicProvider(config.apiKey);
    case 'google':
      return new GoogleProvider(config.apiKey);
    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}
