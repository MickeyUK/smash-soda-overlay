<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';
import { useConfigStore } from '@/stores/configStore';
import { useOverlayStore } from '@/stores/overlayStore';
import { GetMonitors, MoveMainWindowToMonitor, Focus } from '@bindings/windowservice';

const configStore = useConfigStore();
const defaultConfig = ref(configStore.app.clone());
const overlayStore = useOverlayStore();

const displays = ref([]);

const themes = computed(() => [
    { label: 'Default', value: 'default' },
    ...overlayStore.themes.map((theme) => {
        const label = theme.meta?.name || theme.id || 'Unknown';
        const value = theme.id || label;
        return { label, value };
    })
]);

async function getDisplays() {
    const monitors = await GetMonitors();
    displays.value = monitors.map((m, i) => {
        return {
            label: m.Name,
            value: i
        }
    })
}

async function setDisplay(display: string|number) {
    await MoveMainWindowToMonitor(display as number);
    await Focus();
}

async function setTheme(theme: string) {
    configStore.app.overlay.theme = theme;
    await overlayStore.applyTheme(theme);
}

async function openThemeRegistry() {
    await overlayStore.getThemes();
}

onMounted(async () => {
    await overlayStore.loadThemes();
    await getDisplays();
})
</script>
<template>

    <form class="form">
        <div class="theme-group" v-if="themes.length > 0">
            <FormSelect
            label="Theme"
            name="theme"
            :value="configStore.app.overlay.theme"
            :options="themes"
            @oninput="setTheme($event)"
            >
                Select the custom theme for the overlay.
            </FormSelect>
            <div class="theme-actions">
                <div class="btn btn-secondary" @click="openThemeRegistry">Get More Themes</div>
            </div>
        </div>

        <FormRange
        label="Opacity"
        name="opacity"
        :modelValue="(configStore.app.overlay.opacity * 100).toFixed(0)"
        @oninput="configStore.app.overlay.opacity = $event / 100"
        >
            Set the opacity of the overlay.
        </FormRange>

        <FormSelect
        v-if="displays.length > 0"
        label="Display"
        name="theme"
        :value="configStore.app.overlay.display"
        :options="displays"
        @oninput="setDisplay($event)"
        >
            Select the display to show the overlay on.
        </FormSelect>
    </form>

</template>
<style lang="scss" scoped>
.form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.theme-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.theme-actions {
    display: flex;
    justify-content: flex-end;
}
</style>
