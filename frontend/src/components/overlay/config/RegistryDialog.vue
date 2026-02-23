<template>
    <div class="modal-overlay">
        <div class="modal-container">
            <div class="modal window raised">
                <div class="window-content">
                    <div class="window-header font-primary">
                        Download {{ (type === 'plugins' ? 'Plugin' : 'Theme') }}
                    </div>
                    <div class="window-body font-primary">
                        <template v-if="!isBusy">
                            <div v-for="(plugin, index) in registry.items" class="plugin-group">
                                <div class="plugin">
                                    <div>
                                        <span class="plugin-label">{{ plugin.name }}</span>
                                    </div>
                                    <div style="margin-bottom: 0.5rem;">
                                        <i>by <span class="form-help">{{ plugin.author }}</span></i>
                                    </div>
                                    <div>
                                        {{ plugin.description }}
                                    </div>
                                </div>
                                <div class="plugin-download">
                                    <template v-if="type === 'plugins'">
                                        <a v-if="!overlayStore.isPluginLoaded(plugin.name)" @click="downloadPlugin(plugin)" class="btn btn-secondary">Download</a>
                                        <a v-else class="btn btn-disabled">Installed</a>
                                    </template>
                                    <template v-else>
                                        <a v-if="!overlayStore.isThemeLoaded(plugin.id)" @click="downloadPlugin(plugin)" class="btn btn-secondary">Download</a>
                                        <a v-else class="btn btn-disabled">Installed</a>
                                    </template>
                                </div>
                            </div>
                        </template>
                    </div>
                    <div class="window-footer font-primary">
                        <div class="btn btn-secondary" @click="close">Cancel</div>
                        <div class="btn btn-primary" @click="confirm">Confirm</div>
                    </div>
                </div>

                <div class="modal-close">
                    <div class="btn btn-round" @click="close">
                        <i class="fas fa-times"></i>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { DownloadPlugin } from '@bindings/pluginservice';
import { DownloadTheme } from '@bindings/styleservice';
import { useOverlayStore } from '@/stores/overlayStore';
const emit = defineEmits(['cancel', 'confirm']);

const overlayStore = useOverlayStore();
const isBusy = ref(false);

const props = defineProps({
    type: {
        type: String,
        default: 'plugin',
    },
    registry: {
        type: Object,
    },
});

function close() {
    emit('cancel');
}

function confirm() {
    emit('confirm');
}

async function downloadPlugin(plugin: any) {
    isBusy.value = true;

    try {
        if (props.type === 'plugins') {
            await DownloadPlugin(plugin.id, plugin.files);
            await overlayStore.loadPlugins();
            return;
        }

        await DownloadTheme(plugin.id, plugin.files);
        await overlayStore.loadThemes();
    } finally {
        isBusy.value = false;
    }
}
</script>
<style lang="scss" scoped>
.modal-overlay {
    background: rgba(0, 0, 0, 0.2);
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.modal-container {
    width: 100%;
    height: 100%;
    max-height: 500px;
    max-width: 500px;
}

.modal {
    width: 100%;
    height: 100%;
    position: relative;

    &.has-sidebar {
        display: flex;

        .modal-content {
            flex: 1;
        }
    }

    .modal-close {
        position: absolute;
        top: -12px;
        right: -12px;
        cursor: pointer;
    }
}

.window-body {
    height: 100%;
}

.plugin-group {
    padding: .5rem;
    border: solid 1px rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    margin-bottom: 1rem;
    position: relative;

    .plugin-label {
        font-weight: bold;
    }

    .plugin-download {
        margin-top: 0.5rem;
    }
}
</style>
