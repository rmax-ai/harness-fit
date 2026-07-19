<script lang="ts">
  import Section from "$lib/components/ui/Section.svelte";
  import { base } from "$app/paths";
</script>

<Section>
  <h2 class="text-3xl font-bold text-white mb-2">Architecture</h2>
  <p class="text-slate-400 mb-8">Provider-agnostic pipeline from experiment definition to results.</p>
  <div class="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
    <img src="{base}/pipeline.svg" alt="Architecture pipeline diagram" class="w-full h-auto" />
  </div>
</Section>
