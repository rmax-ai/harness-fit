<script lang="ts">
  import Section from "$lib/components/ui/Section.svelte";
  import { REPO } from "$lib/data/meta";
</script>

<Section>
  <h2 class="text-3xl font-bold text-white mb-2">Quickstart</h2>
  <p class="text-slate-400 mb-8">Get started in under a minute.</p>

  <div class="bg-black rounded-lg p-5 overflow-x-auto mb-6">
    <pre class="text-sm text-slate-300 font-mono"># Clone and install
git clone https://github.com/{REPO}.git
cd harness-fit

# Install dependencies (requires Bun)
bun install

# Run tests
bun test packages/ apps/ benchmarks/repositories/

# Type check
bun run typecheck

# Initialize and validate provider credentials
bun harnessfit init
bun harnessfit providers check

# Run the generic-harness baseline (requires provider keys)
bun harnessfit baseline --experiment experiments/definitions/default.yaml</pre>
  </div>

  <div class="bg-slate-900/50 border border-slate-800 rounded-lg p-5">
    <h3 class="text-white font-semibold mb-2">API Keys</h3>
    <p class="text-sm text-slate-400">
      Set <code class="text-indigo-400">OPENAI_API_KEY</code>,
      <code class="text-indigo-400">ANTHROPIC_API_KEY</code>,
      and <code class="text-indigo-400">GOOGLE_API_KEY</code> in your environment.
      Copy <code class="text-indigo-400">.env.example</code> to get started. Provider model IDs can be
      overridden with <code class="text-indigo-400">HARNESSFIT_*_MODEL</code> variables when an account
      does not expose the defaults.
    </p>
  </div>
</Section>
