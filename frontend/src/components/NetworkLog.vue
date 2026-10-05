<script setup lang="ts">
import { Activity, ChevronUp } from 'lucide-vue-next'
import {
  durationLabel,
  entrySummary,
  requestCountLabel,
  statusLabel,
  statusTagClass,
} from '../api/networkLog'
import { useNetworkLogStore } from '../stores/networkLog'

const log = useNetworkLogStore()
</script>

<template>
  <footer class="netlog" data-testid="network-log">
    <button
      type="button"
      class="netlog__toggle"
      :aria-expanded="log.open"
      aria-controls="netlog-panel"
      data-testid="network-log-toggle"
      @click="log.toggle()"
    >
      <Activity class="netlog__icon" :size="15" :stroke-width="1.5" />
      <span class="netlog__title">Network log</span>
      <span class="tag tag-neutral netlog__count" data-testid="network-log-count">
        {{ requestCountLabel(log.entries.length) }}
      </span>
      <span v-if="log.hasPending" class="netlog__pulse" aria-label="Request in progress"></span>
      <span class="netlog__last" data-testid="network-log-last">
        {{ log.last === null ? 'No requests yet' : entrySummary(log.last) }}
      </span>
      <span class="netlog__spacer"></span>
      <ChevronUp class="netlog__chevron" :class="{ 'is-open': log.open }" :size="15" :stroke-width="1.5" />
    </button>
    <div v-if="log.open" id="netlog-panel" class="netlog__panel">
      <div class="netlog__grid netlog__head">
        <span>Time</span>
        <span>Method</span>
        <span>Path</span>
        <span>Status</span>
        <span class="netlog__num">Duration</span>
      </div>
      <div
        v-for="entry in log.entries"
        :key="entry.id"
        class="netlog__grid netlog__row"
        data-testid="network-log-row"
      >
        <span class="netlog__time">{{ entry.time }}</span>
        <span class="netlog__method">{{ entry.method }}</span>
        <span class="netlog__path">{{ entry.path }}</span>
        <span><span class="netlog__status" :class="statusTagClass(entry)">{{ statusLabel(entry) }}</span></span>
        <span class="netlog__num netlog__time">{{ durationLabel(entry) }}</span>
      </div>
      <p v-if="log.entries.length === 0" class="netlog__empty">No requests yet.</p>
    </div>
  </footer>
</template>
