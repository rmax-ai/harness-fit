<script lang="ts">
  import Section from "$lib/components/ui/Section.svelte";
  import { METRICS } from "$lib/data/meta";
</script>

<Section>
  <h2 class="text-3xl font-bold text-white mb-2">By the Numbers</h2>
  <p class="text-slate-400 mb-8">Current project state.</p>
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
    {#each METRICS as metric}
      <div class="bg-slate-900/50 border border-slate-800 rounded-lg p-5 text-center">
        <div class="text-2xl font-bold text-indigo-400 mb-1">{metric.label}</div>
        <div class="text-xs text-slate-500">{metric.desc}</div>
      </div>
    {/each}
  </div>
</Section>
