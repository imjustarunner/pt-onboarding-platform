<template>
 <div class="pl-company pl-company-frame" :data-plotline-theme="brand?.theme || 'clarity'" :style="plotlineThemeStyle(brand)">
  <header class="pl-product-bar"><a href="https://plotlinepo.com" aria-label="Plotline home"><img src="/assets/plotline/website/brand/logos/plotline-wordmark-editable.svg" alt="Plotline by PlotTwistCo"></a><span>{{ context }}<br><slot name="product-action" /></span></header>
  <slot />
  <footer class="pl-company-footer"><img src="/assets/plotline/website/brand/motifs/plotline-sparkle.svg" alt="">A people journey, powered by Plotline</footer>
 </div>
</template>
<script setup>
import {plotlineThemeStyle} from '../../utils/plotlineTheme';
import '../../styles/plotlineCompany.css';
defineProps({brand:Object,context:{type:String,default:'Your people’s next chapter'}});
</script>
