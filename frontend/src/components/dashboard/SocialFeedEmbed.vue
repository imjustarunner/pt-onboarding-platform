<template>
  <div class="social-feed-embed" :class="{ expanded }">
    <div v-if="feed.type === 'instagram'" class="embed-frame-wrap">
      <iframe
        v-if="instagramEmbedUrl"
        :src="instagramEmbedUrl"
        class="embed-iframe"
        frameborder="0"
        scrolling="no"
        allowtransparency="true"
        title="Instagram"
      />
      <div v-else class="embed-fallback">
        <a v-if="feed.externalUrl || feed.url" :href="(feed.externalUrl || feed.url)" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
          Open on Instagram
        </a>
        <span v-else class="muted">No Instagram URL configured.</span>
      </div>
    </div>
    <div v-else-if="feed.type === 'facebook'" class="embed-frame-wrap">
      <iframe
        v-if="facebookEmbedUrl"
        :src="facebookEmbedUrl"
        class="embed-iframe"
        frameborder="0"
        scrolling="no"
        allow="encrypted-media"
        title="Facebook"
      />
      <div v-else class="embed-fallback">
        <a v-if="feed.externalUrl || feed.url" :href="(feed.externalUrl || feed.url)" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
          Open on Facebook
        </a>
        <span v-else class="muted">No Facebook URL configured.</span>
      </div>
    </div>
    <div v-else class="embed-link-only">
      <a
        v-if="feed.externalUrl || feed.url"
        :href="(feed.externalUrl || feed.url)"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-primary"
      >
        Open {{ feed.type === 'rss' ? 'feed' : 'link' }}
      </a>
      <span v-else class="muted">No URL configured.</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  feed: {
    type: Object,
    required: true
  },
  expanded: {
    type: Boolean,
    default: false
  }
});

const instagramEmbedUrl = computed(() => {
  const u = props.feed?.url || props.feed?.embedUrl || '';
  if (!u) return null;
  const s = String(u).trim();
  // Already an embed URL
  if (s.includes('/embed') || s.includes('/embed/')) return s;
  // Post URL: https://www.instagram.com/p/CODE/ or https://instagram.com/p/CODE/
  const m = s.match(/instagram\.com\/p\/([^/?]+)/i);
  if (m) return `https://www.instagram.com/p/${m[1]}/embed/`;
  return null;
});

const facebookEmbedUrl = computed(() => {
  const u = props.feed?.url || props.feed?.embedUrl || '';
  if (!u) return null;
  const s = String(u).trim();
  // Page URL to Page plugin embed
  let pageUrl = s;
  if (!s.includes('facebook.com')) return null;
  if (s.includes('/plugins/')) return s;
  const m = s.match(/(https?:\/\/[^/]*facebook\.com\/[^?\s]+)/i);
  if (m) pageUrl = m[1];
  const encoded = encodeURIComponent(pageUrl);
  return `https://www.facebook.com/plugins/page.php?href=${encoded}&tabs=timeline&width=500&height=600&small_header=false&adapt_container_width=true&hide_cover=false`;
});
</script>

<style scoped>
.social-feed-embed {
  width: 100%;
}

.embed-frame-wrap {
  width: 100%;
  min-height: 400px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.social-feed-embed.expanded .embed-frame-wrap {
  min-height: 600px;
  height: 100%;
}

.embed-iframe {
  width: 100%;
  height: 400px;
  border: none;
}

.social-feed-embed.expanded .embed-iframe {
  height: 100%;
  min-height: 600px;
}

.embed-fallback,
.embed-link-only {
  padding: 16px;
}

.embed-fallback .btn,
.embed-link-only .btn {
  margin-right: 8px;
}

.muted {
  color: var(--text-muted, #666);
}
</style>
