<template>
  <RouterView :key="$route.params.slug || $route.path" />
  <footer class="auricwell-service-terms">
    <p>AuricWell is software operated by Plot Twist Co. Your practice is responsible for its care and clinical records.</p>
    <nav aria-label="AuricWell terms and privacy">
      <a href="https://auricwell.com/auricwell/terms">Terms of Use</a>
      <a href="https://auricwell.com/auricwell/privacypolicy">Privacy Policy</a>
      <a href="https://auricwell.com/auricwell/platformhipaa">Health Information & Privacy</a>
      <a href="https://mh4kidz.org/schoolcarebridge/terms">SchoolCareBridge terms, when using that service</a>
    </nav>
    <p>Organization service agreements and BAAs require separate authorized signatures. Reading these notices does not authorize recording, record sharing or SMS enrollment.</p>
  </footer>
</template>
<style scoped>
.auricwell-service-terms{padding:20px 28px;color:#4e514c;background:#f6f5f0;font:13px/1.6 system-ui,sans-serif}.auricwell-service-terms p{margin:0 0 8px}.auricwell-service-terms nav{display:flex;flex-wrap:wrap;gap:12px 24px;margin-bottom:10px}.auricwell-service-terms a{color:inherit;text-decoration:underline}
</style>
