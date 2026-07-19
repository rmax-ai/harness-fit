<script lang="ts">
  import "../app.css";
  import Header from "$lib/components/sections/Header.svelte";

  let { children }: { children?: import("svelte").Snippet } = $props();
</script>

<Header />
<main>
  {@render children?.()}
</main>
