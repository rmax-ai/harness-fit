<script lang="ts">
  import { REPO, PROJECT_VERSION } from "$lib/data/meta";
  import { base } from "$app/paths";
</script>

<nav class="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-50">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
    <a href="{base}/" class="flex items-center gap-2 text-white font-semibold">
      <span class="text-lg">🔬</span>
      <span>HarnessFit</span>
      <span class="text-xs text-slate-500 font-mono ml-1">{PROJECT_VERSION}</span>
    </a>
    <div class="flex items-center gap-4 text-sm text-slate-400">
      <a href="https://github.com/{REPO}" class="hover:text-white transition-colors">GitHub</a>
    </div>
  </div>
</nav>
