<script lang="ts">
  import { REPO, PROJECT_VERSION } from "$lib/data/meta";
</script>

<footer class="border-t border-slate-800 py-8 px-4 sm:px-6">
  <div class="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
    <div>
      HarnessFit {PROJECT_VERSION} · Apache 2.0
    </div>
    <div class="flex items-center gap-4">
      <a href="https://github.com/{REPO}" class="hover:text-slate-300 transition-colors">GitHub</a>
      <a href="https://github.com/{REPO}/blob/main/SPEC.md" class="hover:text-slate-300 transition-colors">Spec</a>
      <a href="https://github.com/{REPO}/blob/main/docs/ARCHITECTURE.md" class="hover:text-slate-300 transition-colors">Architecture</a>
    </div>
  </div>
</footer>
