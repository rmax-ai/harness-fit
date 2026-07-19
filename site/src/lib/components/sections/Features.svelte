<script lang="ts">
  import Section from "$lib/components/ui/Section.svelte";
  import { FEATURES } from "$lib/data/meta";
</script>

<Section>
  <h2 class="text-3xl font-bold text-white mb-2">Features</h2>
  <p class="text-slate-400 mb-8">What HarnessFit provides for agent harness research.</p>
  <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each FEATURES as feature}
      <div class="bg-slate-900/50 border border-slate-800 rounded-lg p-5">
        <h3 class="text-white font-semibold mb-2">{feature.title}</h3>
        <p class="text-sm text-slate-400">{feature.desc}</p>
      </div>
    {/each}
  </div>
</Section>
