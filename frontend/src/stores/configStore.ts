import { defineStore } from 'pinia';
import { ref } from 'vue';
import { createConfirmDialog } from 'vuejs-confirm-dialog';
import { Events } from '@wailsio/runtime';
import { RegisterHotkey } from '../../bindings/SmashGlass/services/hotkeyservice';
import { RegisterHotkeyArgs } from 'bindings/SmashGlass/services';
import AppConfig from '@/models/config/AppConfig';
import ConfigModalView from '@/components/overlay/config/ConfigModalView.vue';
import { useOverlayStore } from './overlayStore';
import { Focus, Blur } from '../../bindings/SmashGlass/services/windowservice';

export const useConfigStore = defineStore('configStore', () => {

    const app = ref(new AppConfig());

    const saveTimeoutId = ref(0);

    const configModalEnabled = ref(false);

    /**
     * Initializes the store.
     */
    async function init() {
        await resetConfig();
        await loadConfig();
        applyOverlayZoom();
        await registerHotkeys();
        await handleHotkeys();

        window.$eventBus.on('open:menu', (data: any) => {
            openConfig();
        })
    }

    /**
     * Opens the config modal.
     */
    async function openConfig() {

        if (configModalEnabled.value) return;
        configModalEnabled.value = true;

        // Lock the overlay
        const overlayStore = useOverlayStore();
        overlayStore.locked = true;
        overlayStore.interactable = false;
        overlayStore.widgets.forEach(widget => {
            widget.active = false;
        })

        Focus();

        const { reveal, onConfirm, onCancel } = createConfirmDialog(ConfigModalView, {
        })

        onCancel(() => {
            overlayStore.locked = false;
            configModalEnabled.value = false;
            Blur();
        })
    
        onConfirm(() => {
            overlayStore.locked = false;
            configModalEnabled.value = false;
            Blur();
        })
        reveal()
    }

    /**
     * Saves the config. Uses a timer to avoid spamming the backend.
     */
    async function saveConfig() {
        clearTimeout(saveTimeoutId.value);
        saveTimeoutId.value = window.setTimeout(() => {
            
            // Save config to local storage
            localStorage.setItem('config', JSON.stringify(app.value));
            
        }, 1000);
    }

    /**
     * Loads the config.
     */
    async function loadConfig() {

        try {
            // Load config from local storage
            const config = localStorage.getItem('config');
            if (config) {
                app.value = new AppConfig(JSON.parse(config));
            }
        } catch (error) {
            console.warn('Failed to load config, resetting to defaults.', error);
            await resetConfig();
        }

    }

    async function resetConfig() {
        app.value = new AppConfig();
        await saveConfig();
    }

    /**
     * Applies the current zoom level to the overlay surface.
     */
    function applyOverlayZoom() {
        const zoom = Math.max(0.5, Math.min(1.5, Number(app.value.overlay.zoom) || 1));
        app.value.overlay.zoom = zoom;

        document.body.style.transformOrigin = 'top left';
        document.body.style.transform = `scale(${zoom})`;
    }

    /**
     * Registers a hotkey on the backend.
     */
    async function registerHotkey(args: RegisterHotkeyArgs) {
        try {
            await RegisterHotkey(args);
        } catch (e) {
            console.warn(e);
        }
    }

    /**
     * Registers the hotkeys on the backend.
     */
    async function registerHotkeys() {
        await registerHotkey({
            Name: 'hotkey:chat',
            Modifiers: app.value.hotkeys['hotkey:chat'].modifiers,
            Key: app.value.hotkeys['hotkey:chat'].key,
            Event: 'hotkey:chat'
        });

        await registerHotkey({
            Name: 'hotkey:opacity:in',
            Modifiers: app.value.hotkeys['hotkey:opacity:in'].modifiers,
            Key: app.value.hotkeys['hotkey:opacity:in'].key,
            Event: 'hotkey:opacity:in'
        });

        await registerHotkey({
            Name: 'hotkey:opacity:out',
            Modifiers: app.value.hotkeys['hotkey:opacity:out'].modifiers,
            Key: app.value.hotkeys['hotkey:opacity:out'].key,
            Event: 'hotkey:opacity:out'
        });

        await registerHotkey({
            Name: 'hotkey:zoom:out',
            Modifiers: app.value.hotkeys['hotkey:zoom:out'].modifiers,
            Key: app.value.hotkeys['hotkey:zoom:out'].key,
            Event: 'hotkey:zoom:out'
        });

        await registerHotkey({
            Name: 'hotkey:zoom:in',
            Modifiers: app.value.hotkeys['hotkey:zoom:in'].modifiers,
            Key: app.value.hotkeys['hotkey:zoom:in'].key,
            Event: 'hotkey:zoom:in'
        });

        await registerHotkey({
            Name: 'hotkey:menu',
            Modifiers: app.value.hotkeys['hotkey:menu'].modifiers,
            Key: app.value.hotkeys['hotkey:menu'].key,
            Event: 'hotkey:menu'
        });

        await registerHotkey({
            Name: 'hotkey:move',
            Modifiers: app.value.hotkeys['hotkey:move'].modifiers,
            Key: app.value.hotkeys['hotkey:move'].key,
            Event: 'hotkey:move'
        });
    }

    /**
     * Handles the hotkey events.
     */
    async function handleHotkeys() {

        Events.On('hotkey:opacity:in', () => {
            app.value.overlay.opacity = Math.min(1, app.value.overlay.opacity + 0.1);
            saveConfig();
        });

        Events.On('hotkey:opacity:out', () => {
            app.value.overlay.opacity = Math.max(0, app.value.overlay.opacity - 0.1);
            saveConfig();
        });

        Events.On('hotkey:zoom:in', () => {
            app.value.overlay.zoom = Math.min(1.5, app.value.overlay.zoom + 0.1);
            applyOverlayZoom();
            saveConfig();

        });

        Events.On('hotkey:zoom:out', () => {

            app.value.overlay.zoom = Math.max(0.5, app.value.overlay.zoom - 0.1);
            applyOverlayZoom();
            saveConfig();

        });

        Events.On('hotkey:menu', () => {
            openConfig();

            // Show menu
        });

    }

    return {
        init,
        app,
        saveConfig,
        loadConfig,
        resetConfig
    }
})
