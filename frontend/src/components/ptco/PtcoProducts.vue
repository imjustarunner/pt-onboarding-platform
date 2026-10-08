<template>
 <section id="products" class="ptco-band ptco-products"><div class="ptco-wrap">
  <div class="ptco-section-heading"><div><p class="ptco-eyebrow">Products by Plot Twist Co.</p><h2>One family.<br>Six focused products.</h2></div><p>Plot Twist HQ, AuricWell, Conversa, Plotline, SchoolCareBridge, and Summit Stats Team Challenge are Plot Twist Co. products. Choose the workspace that fits your team, with connected services behind the scenes. {{ CONVERSA_RELATIONSHIP }}</p></div>
  <div class="ptco-product-family"><article v-for="product in products" :id="product.id" :key="product.id" :class="product.id">
   <div class="product-mark"><router-link v-if="product.route" :to="product.route" :aria-label="`Explore ${product.name}`"><img :src="product.logo" :alt="product.name"/></router-link><img v-else :src="product.logo" :alt="product.name"/><span>A Plot Twist Co. product</span></div>
   <p class="ptco-eyebrow">{{product.audience}}</p><h3><router-link v-if="product.route" :to="product.route">{{ product.name }}</router-link><template v-else>{{product.name}}</template></h3><p>{{product.description}}</p>
   <ul><li v-for="feature in product.features" :key="feature">{{feature}}</li></ul>
   <p class="product-context">{{product.context}}</p><router-link v-if="product.id==='plottwisthq'" class="ptco-button" to="/p/ptco/hq">Explore Plot Twist HQ →</router-link><router-link v-else-if="product.route" class="ptco-button" :to="product.route">{{ product.actionLabel }} →</router-link><a v-else class="ptco-button" :href="product.url">Explore {{product.name}} ↗</a>
   <a v-if="product.demo" class="ptco-text-link" :href="product.demo">{{ product.demoLabel }} ↗</a>
  </article></div>
  <p class="ptco-small">Your organization’s permissions, configured features, agreements and integrations determine access. For care-related products, the treating practice delivers care. Summit Stats supports fitness groups and competition, not clinical care. Product branding does not change the parties named in your agreements.</p>
 </div></section>
</template>
<script setup>
import { CONVERSA_RELATIONSHIP } from '../../constants/conversa';
import { ptcoProducts as products } from '../../constants/ptcoProducts';

</script>
<style scoped>
.ptco-product-family{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.ptco-product-family article{display:flex;flex-direction:column;min-width:0;padding:26px;border:1px solid #e5dcde;border-top:4px solid #970e22;border-radius:12px;background:white}.ptco-product-family .conversa{border-top-color:#d4a017}.ptco-product-family .auricwell{border-top-color:#0649ce}.ptco-product-family .schoolcarebridge{border-top-color:#139e61}.ptco-product-family .sstc{border-top-color:#73a63b}.product-mark{display:flex;align-items:center;justify-content:space-between;gap:16px;height:95px;margin-bottom:24px}.product-mark img{width:105px;height:85px;object-fit:contain}.schoolcarebridge .product-mark img{width:160px;object-fit:cover}.product-mark span{font:11px/1.6 Inter,system-ui,sans-serif;color:#626b7e;max-width:85px}.ptco-product-family h3{font-size:29px;margin-bottom:18px}.ptco-product-family ul{padding-left:19px;margin:8px 0 24px;font-size:14px;line-height:1.8}.ptco-product-family .product-context{font-size:12px;line-height:1.7;margin-top:auto}.ptco-product-family .ptco-text-link{font-size:12px}.ptco-products .ptco-small{margin-top:22px;font-size:12px;max-width:115ch}@media(max-width:760px){.ptco-product-family{grid-template-columns:1fr}.product-mark{justify-content:start}.product-mark span{max-width:none}.ptco-product-family article{padding:22px}.ptco-product-family .ptco-button{align-self:start}}
</style>

<style scoped>
.ptco-product-family .plotline{border-top-color:#0f2d24}.plotline .product-mark img{width:170px;height:auto}
</style>
